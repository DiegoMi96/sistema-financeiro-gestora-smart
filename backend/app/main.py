import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine

# Importa todos os modelos para criar tabelas
import app.models
import app.models.extra          # PaymentRecord, AIAnalysis, AsaasPaymentSync
import app.models.contestation   # ContestationCycle, ContestationItem, ContestationCredit

# Importa routers
from app.routers import auth, billing, dashboard
from app.routers.settings import router as settings_router
from app.routers.analyst      import router as analyst_router
from app.routers.ai_diagnosis import router as ai_router
from app.services.asaas_client import router as asaas_router
from app.routers.previsibilidade import router as previsibilidade_router
from app.routers.contestation import router as contestation_router
from app.routers.clients        import router as clients_router
from app.routers.organograma    import router as organograma_router, public_router as organograma_public_router
from app.routers.sheets         import router as sheets_router

# ── Cria enums de contestação antes do create_all (evita UniqueViolation) ──
def _ensure_contestation_enums():
    from sqlalchemy import text
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        for enum_name, values in [
            ("contestationcyclestatus", ["rascunho","revisao","aprovado","enviado","credito_parcial","credito_total","encerrado"]),
            ("contestationitemtype",    ["valor_acima_contrato","pcte_adicional_indevido","linha_nao_identificada","transferencia","cs"]),
            ("contestationitemstatus",  ["detectado","contestar","ignorar","enviado","aceito","rejeitado"]),
        ]:
            exists = db.execute(text(
                "SELECT 1 FROM pg_type WHERE typname = :n"
            ), {"n": enum_name}).fetchone()
            if not exists:
                vals = ", ".join(f"'{v}'" for v in values)
                db.execute(text(f"CREATE TYPE {enum_name} AS ENUM ({vals})"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[migrations] contestation enums skipped: {e}")
    finally:
        db.close()

_ensure_contestation_enums()

# ── Cria tabelas (checkfirst evita erro de sequence duplicada) ─
Base.metadata.create_all(bind=engine, checkfirst=True)

# ── Migrations incrementais (ADD COLUMN IF NOT EXISTS) ────────
def _run_migrations():
    from sqlalchemy import text
    from app.database import SessionLocal
    db = SessionLocal()

    # Adiciona novos valores ao enum userrole (PostgreSQL exige commit imediato)
    try:
        for v in ("logistica", "backoffice", "comercial"):
            db.execute(text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{v}'"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[migrations] enum update skipped: {e}")

    # Garante que billing_cycles.created_at existe (usado na sync de clientes)
    try:
        db.execute(text("""
            DO $$ BEGIN
                ALTER TABLE billing_cycles ADD COLUMN IF NOT EXISTS created_at
                    TIMESTAMPTZ DEFAULT NOW();
            EXCEPTION WHEN others THEN NULL;
            END $$;
        """))
        db.commit()
    except Exception:
        db.rollback()

    # Índices compostos e faltantes — grandes ganhos em queries de status+data
    try:
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_aps_status_due    ON asaas_payments_sync (status, due_date)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_aps_credit_date   ON asaas_payments_sync (credit_date)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_ib_status_venc    ON itau_boletos (status, data_vencimento)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_ib_pagamento      ON itau_boletos (data_pagamento)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_ba_cycle_created  ON billing_adjustments (cycle_id, created_at DESC)"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[migrations] index creation skipped: {e}")

    cols = [
        ("billing_adjustments", "analista",        "VARCHAR(100)"),
        ("billing_adjustments", "consultor",        "VARCHAR(150)"),
        ("billing_adjustments", "num_fatura",       "VARCHAR(50)"),
        ("billing_adjustments", "data_vencimento",  "DATE"),
        ("billing_adjustments", "ofensor",          "VARCHAR(50)"),
        # Novos campos da base completa
        ("billing_lines", "id_pedido",             "VARCHAR(255)"),
        ("billing_lines", "id_contrato",           "VARCHAR(255)"),
        ("billing_lines", "franquia_mb",           "FLOAT"),
        ("itau_boletos",  "description",            "TEXT"),
    ]
    try:
        cols.append(("users", "custom_role_key", "VARCHAR(100)"))
        cols.append(("users", "can_view_smt",    "BOOLEAN"))
        for table, col, typ in cols:
            db.execute(text(f"""
                DO $$ BEGIN
                    ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {typ};
                EXCEPTION WHEN others THEN NULL;
                END $$;
            """))
        db.commit()
    finally:
        db.close()

_run_migrations()

# ── Lifespan (background sync) ────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.asaas_sync import sync_loop
    task = asyncio.create_task(sync_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(billing.router)
app.include_router(dashboard.router)
app.include_router(analyst_router)
app.include_router(ai_router)
app.include_router(asaas_router)
app.include_router(settings_router)
app.include_router(previsibilidade_router)
app.include_router(contestation_router)
app.include_router(clients_router)
app.include_router(organograma_router)
app.include_router(organograma_public_router)   # fotos do organograma (público — <img src>)
app.include_router(sheets_router)


@app.get("/health")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}


# ── Seed inicial (admin padrão) ────────────────────────────────
@app.on_event("startup")
def seed_organograma():
    """Popula o organograma inicial se a tabela estiver vazia."""
    from app.database import SessionLocal
    from app.models import OrgMember
    db = SessionLocal()
    try:
        if db.query(OrgMember).count() > 0:
            return
        # ── Raízes ──────────────────────────────────────────────
        paulo  = OrgMember(name="Paulo Attie",   role_title="CEO & CO-FOUNDER",      department="Diretoria", member_type="CLT", sort_order=0,  show_in_institucional=True, show_in_comercial=True)
        diego_m = OrgMember(name="Diego Moleiro", role_title="CO-FOUNDER",           department="Diretoria", member_type="CLT", sort_order=1,  show_in_institucional=True, show_in_comercial=False)
        db.add_all([paulo, diego_m])
        db.flush()

        # ── Nível 2 ──────────────────────────────────────────────
        diego_mir = OrgMember(name="Diego Miranda",   role_title="Dir. Administrativo",  department="Administrativo", member_type="CLT", parent_id=paulo.id, sort_order=0, show_in_institucional=True, show_in_comercial=False)
        thalles   = OrgMember(name="Thalles Marques", role_title="Gerente Operacional",  department="Operações",      member_type="CLT", parent_id=paulo.id, sort_order=1, show_in_institucional=True, show_in_comercial=False)
        johnny    = OrgMember(name="Johnny Herbert",  role_title="Dir. Comercial",       department="Comercial",      member_type="CLT", parent_id=paulo.id, sort_order=2, show_in_institucional=True, show_in_comercial=True)
        db.add_all([diego_mir, thalles, johnny])
        db.flush()

        # ── Administrativo ───────────────────────────────────────
        carlo  = OrgMember(name="Carlo Augusto", role_title="Lider de Contas a Receber", department="Administrativo", member_type="CLT", parent_id=diego_mir.id, sort_order=0, show_in_institucional=True, show_in_comercial=False)
        mel    = OrgMember(name="Melissa",        role_title="Analista Administrativo/DP", department="Administrativo", member_type="CLT", parent_id=diego_mir.id, sort_order=1, show_in_institucional=True, show_in_comercial=False)
        fern   = OrgMember(name="Fernanda",       role_title="Facilitis",               department="Administrativo", member_type="CLT", parent_id=diego_mir.id, sort_order=2, show_in_institucional=True, show_in_comercial=False)
        jur    = OrgMember(name="Jurídico",       role_title="Jurídico",                department="Administrativo", member_type="Vaga", is_vacancy=True, parent_id=diego_mir.id, sort_order=3, show_in_institucional=True, show_in_comercial=False)
        cont   = OrgMember(name="Contabilidade",  role_title="Contabilidade",           department="Administrativo", member_type="Vaga", is_vacancy=True, parent_id=diego_mir.id, sort_order=4, show_in_institucional=True, show_in_comercial=False)
        db.add_all([carlo, mel, fern, jur, cont])
        db.flush()

        brenda = OrgMember(name="Brenda Moreira", role_title="Analista Contas a Receber", department="Administrativo", member_type="CLT", parent_id=carlo.id, sort_order=0, show_in_institucional=True, show_in_comercial=False)
        db.add(brenda)
        db.flush()

        # ── Operações ────────────────────────────────────────────
        jonathan = OrgMember(name="Jonathan Oliveira",  role_title="Suporte Técnico N2", department="Operações", member_type="CLT", parent_id=thalles.id, sort_order=0, show_in_institucional=True, show_in_comercial=False)
        gabriel_a = OrgMember(name="Gabriel (Allcom)",  role_title="Engenharia",          department="Operações", member_type="PJ",  parent_id=thalles.id, sort_order=1, show_in_institucional=True, show_in_comercial=False)
        lucas    = OrgMember(name="Lucas Oliveira",     role_title="Lider de Logística",  department="Operações", member_type="CLT", parent_id=thalles.id, sort_order=2, show_in_institucional=True, show_in_comercial=False)
        gabriela_b = OrgMember(name="Gabriela",         role_title="Backoffice",          department="Operações", member_type="CLT", parent_id=thalles.id, sort_order=3, show_in_institucional=True, show_in_comercial=False)
        db.add_all([jonathan, gabriel_a, lucas, gabriela_b])
        db.flush()

        amanda  = OrgMember(name="Amanda Oliva",    role_title="Suporte Técnico N2", department="Operações", member_type="CLT", parent_id=jonathan.id, sort_order=0, show_in_institucional=True, show_in_comercial=False)
        gabriel_o = OrgMember(name="Gabriel Oliveira", role_title="Suporte Técnico N2", department="Operações", member_type="CLT", parent_id=jonathan.id, sort_order=1, show_in_institucional=True, show_in_comercial=False)
        daniel  = OrgMember(name="Daniel",          role_title="Analista de Logística", department="Operações", member_type="CLT", parent_id=lucas.id,    sort_order=0, show_in_institucional=True, show_in_comercial=False)
        db.add_all([amanda, gabriel_o, daniel])
        db.flush()

        luiz = OrgMember(name="Luiz", role_title="Suporte Técnico N1", department="Operações", member_type="CLT", parent_id=gabriel_o.id, sort_order=0, show_in_institucional=True, show_in_comercial=False)
        db.add(luiz)
        db.flush()

        # ── Comercial ────────────────────────────────────────────
        decio   = OrgMember(name="Décio",    role_title="Gerente de EXP", department="Comercial", member_type="CLT", parent_id=johnny.id, sort_order=0, show_in_institucional=True, show_in_comercial=True)
        vitoria = OrgMember(name="Vitória",  role_title="Gerente de EXP", department="Comercial", member_type="CLT", parent_id=johnny.id, sort_order=1, show_in_institucional=True, show_in_comercial=True)
        claudia = OrgMember(name="Claudia",  role_title="Gerente de EXP", department="Comercial", member_type="CLT", parent_id=johnny.id, sort_order=2, show_in_institucional=True, show_in_comercial=True)
        renato  = OrgMember(name="Renato",   role_title="Gerente de EXP", department="Comercial", member_type="CLT", parent_id=johnny.id, sort_order=3, show_in_institucional=True, show_in_comercial=True)
        patrick = OrgMember(name="Patrick",  role_title="Gerente de EXP", department="Comercial", member_type="CLT", parent_id=johnny.id, sort_order=4, show_in_institucional=True, show_in_comercial=True)
        henrique = OrgMember(name="Henrique", role_title="Gerente de EXP", department="Comercial", member_type="CLT", parent_id=johnny.id, sort_order=5, show_in_institucional=True, show_in_comercial=True)
        db.add_all([decio, vitoria, claudia, renato, patrick, henrique])
        db.flush()

        julia    = OrgMember(name="Julia",    role_title="Vendedor", department="Comercial", member_type="CLT", parent_id=decio.id,   sort_order=0, show_in_institucional=True, show_in_comercial=True)
        gab_vend = OrgMember(name="Gabriela", role_title="Vendedor", department="Comercial", member_type="CLT", parent_id=vitoria.id, sort_order=0, show_in_institucional=True, show_in_comercial=True)
        daiane   = OrgMember(name="Daiane",   role_title="Vendedor", department="Comercial", member_type="CLT", parent_id=claudia.id, sort_order=0, show_in_institucional=True, show_in_comercial=True)
        embreve  = OrgMember(name="Em breve", role_title="Vendedor", department="Comercial", member_type="Vaga", is_vacancy=True, parent_id=renato.id, sort_order=0, show_in_institucional=True, show_in_comercial=True)
        db.add_all([julia, gab_vend, daiane, embreve])
        db.commit()
        print("✅ Organograma inicial criado.")
    except Exception as e:
        db.rollback()
        print(f"[seed_organograma] erro: {e}")
    finally:
        db.close()


@app.on_event("startup")
def seed_admin():
    from app.database import SessionLocal
    from app.models import User, UserRole
    from app.core.security import hash_password

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == "admin@gestorasmart.com.br").first():
            db.add(User(
                name="Administrador",
                email="admin@gestorasmart.com.br",
                hashed_password=hash_password("Gestora@2024"),
                role=UserRole.ADMIN,
            ))
            db.commit()
            print("✅ Usuário admin criado: admin@gestorasmart.com.br / Gestora@2024")
    finally:
        db.close()


