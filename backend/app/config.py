from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # App
    APP_NAME: str = "Gestora Smart — Sistema Financeiro"
    APP_VERSION: str = "1.2.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@db:5432/gestora_smart"

    # Security
    SECRET_KEY: str = "TROQUE-ESTA-CHAVE-EM-PRODUCAO"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480   # 8 horas

    # Anthropic (diagnóstico IA)
    ANTHROPIC_API_KEY: Optional[str] = None

    # Asaas
    ASAAS_API_KEY: str = ""
    ASAAS_BASE_URL: str = "https://api.asaas.com/v3"

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
