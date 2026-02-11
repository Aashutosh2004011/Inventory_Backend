const express = require('express');
const router = express.Router();
const PurchaseOrder = require('../database/models/purchaseorder.model');
const Product = require('../database/models/product.model');
const { protect,admin } = require('../middleware/auth.middleware');

// Generate unique PO number
const generatePONumber = () => {
  return 'PO-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
};

// @route   GET /api/purchase-orders
// @desc    Get all purchase orders
// @access  Private (Admin)
router.get('/', protect, admin, async (req, res) => {
  try {
    const purchaseOrders = await PurchaseOrder.find({})
      .populate('createdBy', 'name email')
      .populate('items.product', 'name sku')
      .sort({ createdAt: -1 });
    res.json(purchaseOrders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/purchase-orders/:id
// @desc    Get purchase order by ID
// @access  Private (Admin)
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('items.product', 'name sku price');

    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    res.json(purchaseOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/purchase-orders
// @desc    Create new purchase order
// @access  Private (Admin)
router.post('/', protect, admin, async (req, res) => {
  try {
    const { supplier, items, expectedDeliveryDate, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in purchase order' });
    }

    // Calculate total and validate products
    let totalAmount = 0;
    const poItems = [];

    for (let item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      poItems.push({
        product: product._id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice || product.price
      });

      totalAmount += (item.unitPrice || product.price) * item.quantity;
    }

    const purchaseOrder = await PurchaseOrder.create({
      poNumber: generatePONumber(),
      supplier,
      items: poItems,
      totalAmount,
      createdBy: req.user._id,
      expectedDeliveryDate,
      notes
    });

    const populatedPO = await PurchaseOrder.findById(purchaseOrder._id)
      .populate('createdBy', 'name email')
      .populate('items.product', 'name sku');

    res.status(201).json(populatedPO);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/purchase-orders/:id/status
// @desc    Update purchase order status
// @access  Private (Admin)
router.put('/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;

    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    purchaseOrder.status = status;
    
    // If status is received, update product stock
    if (status === 'received' && !purchaseOrder.receivedDate) {
      purchaseOrder.receivedDate = new Date();
      
      for (let item of purchaseOrder.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.stock += item.quantity;
          await product.save();
        }
      }
    }

    const updatedPO = await purchaseOrder.save();
    res.json(updatedPO);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/purchase-orders/:id
// @desc    Update purchase order
// @access  Private (Admin)
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    // Don't allow updates if already received
    if (purchaseOrder.status === 'received') {
      return res.status(400).json({ message: 'Cannot update received purchase order' });
    }

    const updatedPO = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json(updatedPO);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/purchase-orders/:id
// @desc    Delete purchase order
// @access  Private (Admin)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    // Don't allow deletion if already received
    if (purchaseOrder.status === 'received') {
      return res.status(400).json({ message: 'Cannot delete received purchase order' });
    }

    await PurchaseOrder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Purchase order deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;