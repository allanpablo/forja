# Business Rules

## User Domain
- Users must have unique email
- Email must be validated before account activation
- Passwords must be hashed (bcrypt)
- Users can have multiple roles (admin, user)

## Product Domain
- Products belong to categories
- Products have inventory levels
- Prices are in USD (or configurable currency)
- Products can be soft-deleted (not hard-deleted)

## Order Domain
- Orders can only be created by authenticated users
- Items in cart expire after 30 minutes if not checked out
- Orders transition through states: pending → processing → shipped → delivered
- Refunds allowed within 30 days of delivery

## Inventory
- Stock decreases when order is confirmed
- Overselling is prevented (stock check before order creation)
- Stock alerts trigger at 20% of max inventory
