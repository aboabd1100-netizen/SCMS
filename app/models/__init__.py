"""Relational PostgreSQL schema. Business APIs are migrated in separate gates."""
from datetime import datetime, timezone
from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class Timestamped:
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class Role(db.Model):
    __tablename__ = 'roles'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(40), unique=True, nullable=False)


class User(Timestamped, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(50), primary_key=True)
    full_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    phone = db.Column(db.String(40), nullable=False, default='')
    password_hash = db.Column(db.Text, nullable=False)
    role_id = db.Column(db.ForeignKey('roles.id', ondelete='RESTRICT'), nullable=False)
    role = db.relationship(Role)
    status = db.Column(db.String(20), nullable=False, default='Active')
    address = db.Column(db.String(400), nullable=False, default='')
    language = db.Column(db.String(2), nullable=False, default='en')
    account_type = db.Column(db.String(40), nullable=False, default='Business Customer')
    preferences = db.Column(db.JSON, nullable=False, default=dict)
    last_login = db.Column(db.DateTime(timezone=True))
    __table_args__ = (db.CheckConstraint("status IN ('Active','Inactive')"),)


class AuthSession(db.Model):
    __tablename__ = 'auth_sessions'
    token_hash = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.ForeignKey('users.id', ondelete='CASCADE'), index=True)
    csrf_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    user = db.relationship(User)


class PasswordReset(db.Model):
    __tablename__ = 'password_resets'
    token_hash = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used = db.Column(db.Boolean, nullable=False, default=False)


class Supplier(Timestamped, db.Model):
    __tablename__ = 'suppliers'
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    contact_name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(40), nullable=False, default='')
    email = db.Column(db.String(150), nullable=False)
    category = db.Column(db.String(60), nullable=False)
    region = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='Active')
    on_time_delivery_score = db.Column(db.Numeric(5, 2), nullable=False, default=0)
    quality_score = db.Column(db.Numeric(5, 2), nullable=False, default=0)
    __table_args__ = (db.CheckConstraint('on_time_delivery_score BETWEEN 0 AND 100'), db.CheckConstraint('quality_score BETWEEN 0 AND 100'))


class Warehouse(Timestamped, db.Model):
    __tablename__ = 'warehouses'
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    city = db.Column(db.String(160), nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='Operational')
    staff = db.Column(db.Integer, nullable=False, default=0)
    __table_args__ = (db.CheckConstraint('capacity >= 0'), db.CheckConstraint('staff >= 0'))


class Product(Timestamped, db.Model):
    __tablename__ = 'products'
    id = db.Column(db.String(50), primary_key=True)
    name_en = db.Column(db.String(150), nullable=False)
    name_ar = db.Column(db.String(150), nullable=False)
    description_en = db.Column(db.String(500), nullable=False, default='')
    description_ar = db.Column(db.String(500), nullable=False, default='')
    sku = db.Column(db.String(60), unique=True, nullable=False)
    category = db.Column(db.String(60), nullable=False)
    unit_cost = db.Column(db.Numeric(12, 2), nullable=False)
    price = db.Column(db.Numeric(12, 2), nullable=False)
    supplier_id = db.Column(db.ForeignKey('suppliers.id', ondelete='RESTRICT'), nullable=False)
    minimum_stock_level = db.Column(db.Integer, nullable=False, default=0)
    active = db.Column(db.Boolean, nullable=False, default=True)
    icon = db.Column(db.String(30), nullable=False, default='box')
    __table_args__ = (db.CheckConstraint('unit_cost >= 0 AND price >= 0'), db.CheckConstraint('minimum_stock_level >= 0'))


class Inventory(db.Model):
    __tablename__ = 'inventory'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.ForeignKey('products.id', ondelete='RESTRICT'), nullable=False)
    warehouse_id = db.Column(db.ForeignKey('warehouses.id', ondelete='RESTRICT'), nullable=False)
    current_stock = db.Column(db.Integer, nullable=False)
    minimum_stock_level = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    __table_args__ = (db.UniqueConstraint('product_id','warehouse_id'), db.CheckConstraint('current_stock >= 0'), db.CheckConstraint('minimum_stock_level >= 0'))
    @property
    def status(self):
        return 'Out of Stock' if self.current_stock <= 0 else 'Low Stock' if self.current_stock <= self.minimum_stock_level else 'In Stock'


class PurchaseOrder(Timestamped, db.Model):
    __tablename__ = 'purchase_orders'
    id = db.Column(db.String(50), primary_key=True)
    po_number = db.Column(db.String(50), unique=True, nullable=False)
    supplier_id = db.Column(db.ForeignKey('suppliers.id', ondelete='RESTRICT'), nullable=False)
    warehouse_id = db.Column(db.ForeignKey('warehouses.id', ondelete='RESTRICT'), nullable=False)
    order_date = db.Column(db.Date, nullable=False)
    expected_date = db.Column(db.Date, nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status = db.Column(db.String(30), nullable=False, default='Draft')
    created_by = db.Column(db.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    history = db.Column(db.JSON, nullable=False, default=list)
    items = db.relationship('PurchaseOrderItem', cascade='all, delete-orphan', lazy='selectin')
    __table_args__ = (db.CheckConstraint("status IN ('Draft','Pending Approval','Approved','Ordered','Shipped','Received','Cancelled')"),)


class PurchaseOrderItem(db.Model):
    __tablename__ = 'purchase_order_items'
    id = db.Column(db.Integer, primary_key=True)
    purchase_order_id = db.Column(db.ForeignKey('purchase_orders.id', ondelete='CASCADE'), nullable=False)
    product_id = db.Column(db.ForeignKey('products.id', ondelete='RESTRICT'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_cost = db.Column(db.Numeric(12, 2), nullable=False)
    __table_args__ = (db.CheckConstraint('quantity > 0 AND unit_cost >= 0'),)


class CustomerOrder(Timestamped, db.Model):
    __tablename__ = 'customer_orders'
    id = db.Column(db.String(50), primary_key=True)
    order_number = db.Column(db.String(50), unique=True, nullable=False)
    customer_id = db.Column(db.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False)
    subtotal = db.Column(db.Numeric(14, 2), nullable=False)
    discount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    shipping = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    address = db.Column(db.String(400), nullable=False)
    status = db.Column(db.String(30), nullable=False, default='Pending')
    order_date = db.Column(db.Date, nullable=False)
    promo_code = db.Column(db.String(24), nullable=False, default='')
    offer_id = db.Column(db.ForeignKey('offers.id', ondelete='SET NULL'))
    history = db.Column(db.JSON, nullable=False, default=list)
    items = db.relationship('CustomerOrderItem', cascade='all, delete-orphan', lazy='selectin')
    __table_args__ = (db.CheckConstraint("status IN ('Pending','Confirmed','Processing','Ready for Shipment','Shipped','Delivered','Cancelled')"), db.CheckConstraint('total_amount >= 0'))


class CustomerOrderItem(db.Model):
    __tablename__ = 'customer_order_items'
    id = db.Column(db.Integer, primary_key=True)
    customer_order_id = db.Column(db.ForeignKey('customer_orders.id', ondelete='CASCADE'), nullable=False)
    product_id = db.Column(db.ForeignKey('products.id', ondelete='RESTRICT'), nullable=False)
    warehouse_id = db.Column(db.ForeignKey('warehouses.id', ondelete='RESTRICT'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Numeric(12, 2), nullable=False)
    __table_args__ = (db.CheckConstraint('quantity > 0 AND price >= 0'),)


class Shipment(Timestamped, db.Model):
    __tablename__ = 'shipments'
    id = db.Column(db.String(50), primary_key=True)
    tracking_number = db.Column(db.String(50), nullable=False, unique=True)
    customer_order_id = db.Column(db.ForeignKey('customer_orders.id', ondelete='RESTRICT'), unique=True)
    purchase_order_id = db.Column(db.ForeignKey('purchase_orders.id', ondelete='RESTRICT'), unique=True)
    carrier = db.Column(db.String(120), nullable=False)
    origin = db.Column(db.String(400), nullable=False)
    destination = db.Column(db.String(400), nullable=False)
    status = db.Column(db.String(30), nullable=False, default='Preparing')
    estimated_delivery = db.Column(db.Date, nullable=False)
    departure_date = db.Column(db.Date, nullable=False)
    last_update = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    events = db.relationship('ShipmentTrackingEvent', cascade='all, delete-orphan', lazy='selectin', order_by='ShipmentTrackingEvent.timestamp')
    __table_args__ = (db.CheckConstraint("status IN ('Preparing','Picked Up','In Transit','At Destination','Delayed','Delivered')"), db.CheckConstraint('(customer_order_id IS NULL) != (purchase_order_id IS NULL)'))


class ShipmentTrackingEvent(db.Model):
    __tablename__ = 'shipment_tracking_events'
    id = db.Column(db.Integer, primary_key=True)
    shipment_id = db.Column(db.ForeignKey('shipments.id', ondelete='CASCADE'), nullable=False)
    status = db.Column(db.String(30), nullable=False)
    location = db.Column(db.String(150), nullable=False, default='')
    description = db.Column(db.String(500), nullable=False, default='')
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


offer_products = db.Table('offer_products', db.Column('offer_id', db.ForeignKey('offers.id', ondelete='CASCADE'), primary_key=True), db.Column('product_id', db.ForeignKey('products.id', ondelete='RESTRICT'), primary_key=True))


class Offer(Timestamped, db.Model):
    __tablename__ = 'offers'
    id = db.Column(db.String(50), primary_key=True)
    name_en = db.Column(db.String(120), nullable=False)
    name_ar = db.Column(db.String(120), nullable=False)
    description_en = db.Column(db.String(500), nullable=False)
    description_ar = db.Column(db.String(500), nullable=False)
    discount_type = db.Column(db.String(30), nullable=False)
    discount_value = db.Column(db.Numeric(5, 2), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    minimum_quantity = db.Column(db.Integer, nullable=False)
    promo_code = db.Column(db.String(24), unique=True, nullable=False)
    supplier_id = db.Column(db.ForeignKey('suppliers.id', ondelete='RESTRICT'))
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    products = db.relationship(Product, secondary=offer_products, lazy='selectin')
    __table_args__ = (db.CheckConstraint('end_date >= start_date'), db.CheckConstraint('minimum_quantity > 0'), db.CheckConstraint("discount_type IN ('Percent','Free Shipping')"), db.CheckConstraint('discount_value BETWEEN 0 AND 100'))


class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.String(80), primary_key=True)
    user_id = db.Column(db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    type = db.Column(db.String(80), nullable=False)
    message_en = db.Column(db.String(1000), nullable=False)
    message_ar = db.Column(db.String(1000), nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    dedup_key = db.Column(db.String(150), nullable=False)
    severity = db.Column(db.String(20), nullable=False, default='gray')
    href = db.Column(db.String(100), nullable=False, default='notifications.html')
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (db.UniqueConstraint('user_id','dedup_key'),)


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.ForeignKey('users.id', ondelete='SET NULL'))
    action = db.Column(db.String(100), nullable=False)
    entity_type = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(db.String(80))
    description = db.Column(db.String(500), nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    ip_address = db.Column(db.String(45))


class AppState(db.Model):
    __tablename__ = 'app_state'
    id = db.Column(db.Integer, primary_key=True)
    revision = db.Column(db.Integer, nullable=False, default=0)
    settings = db.Column(db.JSON, nullable=False, default=lambda: {'company':'SCMS','currency':'SAR','capacityWarning':85,'stockWarningPercent':120})


class InventorySnapshot(db.Model):
    __tablename__ = 'inventory_snapshots'
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    quantity = db.Column(db.Integer, nullable=False)


class StockTransfer(db.Model):
    __tablename__ = 'stock_transfers'
    id = db.Column(db.String(50), primary_key=True)
    product_id = db.Column(db.ForeignKey('products.id', ondelete='RESTRICT'), nullable=False)
    from_id = db.Column(db.ForeignKey('warehouses.id', ondelete='RESTRICT'), nullable=False)
    to_id = db.Column(db.ForeignKey('warehouses.id', ondelete='RESTRICT'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (db.CheckConstraint('quantity > 0'), db.CheckConstraint('from_id != to_id'))


class InventoryMovement(db.Model):
    __tablename__ = 'inventory_movements'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.ForeignKey('products.id', ondelete='RESTRICT'), nullable=False)
    warehouse_id = db.Column(db.ForeignKey('warehouses.id', ondelete='RESTRICT'), nullable=False)
    user_id = db.Column(db.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    quantity_before = db.Column(db.Integer, nullable=False)
    quantity_after = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (db.CheckConstraint('quantity_before >= 0 AND quantity_after >= 0'),)
