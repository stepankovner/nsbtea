"""Все модели — импорт здесь нужен Alembic для автогенерации миграций."""

from app.models.admin import AdminChallenge, AdminSession, AdminUser, AuditLog
from app.models.base import Base
from app.models.catalog import (
    Category,
    Product,
    ProductImage,
    ProductRelation,
    Tag,
    product_tags,
)
from app.models.content import Application, Event, HomeBlock, Page
from app.models.customers import (
    Cart,
    CartItem,
    Customer,
    CustomerAddress,
    CustomerSession,
    Favorite,
    LoginCode,
)
from app.models.inventory import InventoryMovement, StockAlertState, Supply
from app.models.marketing import (
    PointsTransaction,
    PromoCode,
    PromoCodeUsage,
    Promotion,
    ThursdayPlan,
)
from app.models.orders import Order, OrderItem, OrderStatusChange, Payment, Refund
from app.models.system import (
    MediaFile,
    NotificationRecipient,
    OutboxMessage,
    Setting,
    SlugRedirect,
    WebhookEvent,
)

__all__ = [
    "AdminChallenge",
    "AdminSession",
    "AdminUser",
    "Application",
    "AuditLog",
    "Base",
    "Cart",
    "CartItem",
    "Category",
    "Customer",
    "CustomerAddress",
    "CustomerSession",
    "Event",
    "Favorite",
    "HomeBlock",
    "InventoryMovement",
    "LoginCode",
    "MediaFile",
    "NotificationRecipient",
    "Order",
    "OrderItem",
    "OrderStatusChange",
    "OutboxMessage",
    "Page",
    "Payment",
    "PointsTransaction",
    "Product",
    "ProductImage",
    "ProductRelation",
    "PromoCode",
    "PromoCodeUsage",
    "Promotion",
    "Refund",
    "Setting",
    "SlugRedirect",
    "StockAlertState",
    "Supply",
    "Tag",
    "ThursdayPlan",
    "WebhookEvent",
    "product_tags",
]
