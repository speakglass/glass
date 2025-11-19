from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .accounts import router as accounts_router
from .feedback import router as feedback_router
from .history import router as history_router
from .memory import router as memory_router
from .partners import router as partners_router
from .waitlist import router as waitlist_router
from .voices import router as voices_router
from .billing import router as billing_router

router = APIRouter()
router.include_router(accounts_router)
router.include_router(feedback_router)
router.include_router(history_router)
router.include_router(memory_router)
router.include_router(waitlist_router)
router.include_router(partners_router)
router.include_router(voices_router)
router.include_router(billing_router)


@router.get("/health")
async def health_check():
    """Health check endpoint for monitoring and deployment verification."""
    return JSONResponse(
        content={
            "status": "healthy",
            "service": "glass-api",
            "version": "0.1.0"
        },
        status_code=200
    )
