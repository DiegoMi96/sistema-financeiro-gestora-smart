"""
Organograma — estrutura organizacional da empresa.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import OrgMember

router = APIRouter(prefix="/organograma", tags=["organograma"])

PHOTOS_DIR = "/app/uploads/org_photos"
os.makedirs(PHOTOS_DIR, exist_ok=True)


# ── Schemas ───────────────────────────────────────────────────

class MemberCreate(BaseModel):
    name:                 str
    role_title:           str
    department:           Optional[str] = None
    member_type:          str = "CLT"
    parent_id:            Optional[int] = None
    is_vacancy:           bool = False
    show_in_institucional: bool = True
    show_in_comercial:    bool = True
    sort_order:           int = 0
    notes:                Optional[str] = None


class MemberUpdate(BaseModel):
    name:                 Optional[str] = None
    role_title:           Optional[str] = None
    department:           Optional[str] = None
    member_type:          Optional[str] = None
    parent_id:            Optional[int] = None
    is_active:            Optional[bool] = None
    is_vacancy:           Optional[bool] = None
    show_in_institucional: Optional[bool] = None
    show_in_comercial:    Optional[bool] = None
    sort_order:           Optional[int] = None
    notes:                Optional[str] = None


def _out(m: OrgMember) -> dict:
    return {
        "id":                     m.id,
        "name":                   m.name,
        "role_title":             m.role_title,
        "department":             m.department,
        "member_type":            m.member_type,
        "parent_id":              m.parent_id,
        "photo_url":              f"/api/organograma/photos/{m.photo_path}" if m.photo_path else None,
        "is_active":              m.is_active,
        "is_vacancy":             m.is_vacancy,
        "show_in_institucional":  m.show_in_institucional,
        "show_in_comercial":      m.show_in_comercial,
        "sort_order":             m.sort_order,
        "notes":                  m.notes,
    }


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/members")
def list_members(db: Session = Depends(get_db)):
    rows = (
        db.query(OrgMember)
        .filter(OrgMember.is_active == True)
        .order_by(OrgMember.sort_order, OrgMember.id)
        .all()
    )
    return [_out(m) for m in rows]


@router.get("/tree")
def get_tree(view: str = "institucional", db: Session = Depends(get_db)):
    """Retorna lista plana de membros ativos filtrada pela visão."""
    q = db.query(OrgMember).filter(OrgMember.is_active == True)
    if view == "institucional":
        q = q.filter(OrgMember.show_in_institucional == True)
    else:
        q = q.filter(OrgMember.show_in_comercial == True)
    rows = q.order_by(OrgMember.sort_order, OrgMember.id).all()
    return [_out(m) for m in rows]


@router.post("/members", status_code=201)
def create_member(data: MemberCreate, db: Session = Depends(get_db)):
    m = OrgMember(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.put("/members/{member_id}")
def update_member(member_id: int, data: MemberUpdate, db: Session = Depends(get_db)):
    m = db.get(OrgMember, member_id)
    if not m:
        raise HTTPException(404, "Membro não encontrado")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(m, k, v)
    m.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.delete("/members/{member_id}", status_code=204)
def delete_member(member_id: int, db: Session = Depends(get_db)):
    m = db.get(OrgMember, member_id)
    if not m:
        raise HTTPException(404, "Membro não encontrado")
    m.is_active = False
    m.updated_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/members/{member_id}/photo")
async def upload_photo(
    member_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    m = db.get(OrgMember, member_id)
    if not m:
        raise HTTPException(404, "Membro não encontrado")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Envie uma imagem (JPG ou PNG)")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    filename = f"{member_id}_{uuid.uuid4().hex[:8]}.{ext}"
    content  = await file.read()

    with open(os.path.join(PHOTOS_DIR, filename), "wb") as f:
        f.write(content)

    # Remove foto anterior
    if m.photo_path and m.photo_path != filename:
        old = os.path.join(PHOTOS_DIR, m.photo_path)
        if os.path.exists(old):
            os.remove(old)

    m.photo_path = filename
    m.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"photo_url": f"/api/organograma/photos/{filename}"}


@router.delete("/members/{member_id}/photo", status_code=204)
def remove_photo(member_id: int, db: Session = Depends(get_db)):
    m = db.get(OrgMember, member_id)
    if not m:
        raise HTTPException(404, "Membro não encontrado")
    if m.photo_path:
        old = os.path.join(PHOTOS_DIR, m.photo_path)
        if os.path.exists(old):
            os.remove(old)
        m.photo_path = None
        m.updated_at = datetime.now(timezone.utc)
        db.commit()


@router.get("/photos/{filename}")
def get_photo(filename: str):
    path = os.path.join(PHOTOS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Foto não encontrada")
    return FileResponse(path)
