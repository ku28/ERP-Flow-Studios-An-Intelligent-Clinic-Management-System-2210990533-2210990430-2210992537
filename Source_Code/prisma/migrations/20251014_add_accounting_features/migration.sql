-- CreateTable: Suppliers
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "gstin" TEXT,
    "paymentTerms" TEXT DEFAULT 'Net 30',
    "creditLimit" INTEGER DEFAULT 0,
    "outstandingBalance" INTEGER DEFAULT 0,
    "status" TEXT DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable: Purchase Orders (for supplier orders)
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "poNumber" TEXT NOT NULL UNIQUE,
    "supplierId" INTEGER NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "shippingCost" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: Purchase Order Items
CREATE TABLE "PurchaseOrderItem" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "purchaseOrderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "taxRate" DOUBLE PRECISION DEFAULT 0,
    "discount" INTEGER DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "receivedQuantity" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: Customer Invoices (enhanced)
CREATE TABLE "CustomerInvoice" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL UNIQUE,
    "patientId" INTEGER,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "customerGSTIN" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "balanceAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "termsAndConditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInvoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: Customer Invoice Items
CREATE TABLE "CustomerInvoiceItem" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "customerInvoiceId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "taxRate" DOUBLE PRECISION DEFAULT 0,
    "discount" INTEGER DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInvoiceItem_customerInvoiceId_fkey" FOREIGN KEY ("customerInvoiceId") REFERENCES "CustomerInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: Stock Transactions (track all stock movements)
CREATE TABLE "StockTransaction" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "productId" INTEGER NOT NULL,
    "transactionType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER DEFAULT 0,
    "totalValue" INTEGER DEFAULT 0,
    "balanceQuantity" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "notes" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: Demand Forecast
CREATE TABLE "DemandForecast" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "productId" INTEGER NOT NULL,
    "forecastMonth" TIMESTAMP(3) NOT NULL,
    "predictedDemand" INTEGER NOT NULL,
    "actualDemand" INTEGER DEFAULT 0,
    "averageMonthlySales" DOUBLE PRECISION DEFAULT 0,
    "reorderPoint" INTEGER DEFAULT 0,
    "suggestedOrderQuantity" INTEGER DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemandForecast_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: Payments
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "paymentNumber" TEXT NOT NULL UNIQUE,
    "paymentType" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

CREATE INDEX "CustomerInvoice_patientId_idx" ON "CustomerInvoice"("patientId");
CREATE INDEX "CustomerInvoice_status_idx" ON "CustomerInvoice"("status");
CREATE INDEX "CustomerInvoiceItem_customerInvoiceId_idx" ON "CustomerInvoiceItem"("customerInvoiceId");
CREATE INDEX "CustomerInvoiceItem_productId_idx" ON "CustomerInvoiceItem"("productId");

CREATE INDEX "StockTransaction_productId_idx" ON "StockTransaction"("productId");
CREATE INDEX "StockTransaction_transactionType_idx" ON "StockTransaction"("transactionType");
CREATE INDEX "StockTransaction_transactionDate_idx" ON "StockTransaction"("transactionDate");

CREATE INDEX "DemandForecast_productId_idx" ON "DemandForecast"("productId");
CREATE INDEX "DemandForecast_forecastMonth_idx" ON "DemandForecast"("forecastMonth");

CREATE INDEX "Payment_referenceType_referenceId_idx" ON "Payment"("referenceType", "referenceId");
