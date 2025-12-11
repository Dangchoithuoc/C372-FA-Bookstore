const CartItem = require("./CartItem");

class Cart {
    constructor(sessionCart) {
        // If no cart exists in session, start with an empty array
        this.items = sessionCart || [];
    }

    // Add or increase quantity
    addItem(id, title, price, qty = 1) {
        const existing = this.items.find(i => i.id === id);

        if (existing) {
            existing.qty += Number(qty);
        } else {
            this.items.push(new CartItem(id, title, price, qty));
        }
    }

    // Update quantity
    updateQty(id, qty) {
        const item = this.items.find(i => i.id === id);
        if (!item) return;

        if (qty <= 0) {
            this.removeItem(id);
        } else {
            item.qty = Number(qty);
        }
    }

    // Remove item completely
    removeItem(id) {
        this.items = this.items.filter(i => i.id !== id);
    }

    // Clear the entire cart
    clear() {
        this.items = [];
    }

    // Calculate total price
    get total() {
        return this.items.reduce((sum, item) => {
            return sum + item.subtotal;
        }, 0);
    }
}

module.exports = Cart;
