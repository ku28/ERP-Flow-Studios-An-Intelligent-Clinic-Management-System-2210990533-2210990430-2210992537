-- CreateTable
CREATE TABLE "default_products" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "price_rupees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "purchase_price_rupees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "category" TEXT,
    "description" TEXT,
    "min_stock_level" INTEGER NOT NULL DEFAULT 200,
    "actual_inventory" INTEGER,
    "inventory_value" DOUBLE PRECISION,
    "latest_update" TIMESTAMP(3),
    "purchase_value" DOUBLE PRECISION,
    "sales_value" DOUBLE PRECISION,
    "total_purchased" INTEGER NOT NULL DEFAULT 0,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "default_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_treatments" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "price_rupees" DOUBLE PRECISION,
    "duration" INTEGER,
    "plan_number" TEXT,
    "prov_diagnosis" TEXT,
    "speciality" TEXT,
    "imbalance" TEXT,
    "systems" TEXT,
    "organ" TEXT,
    "disease_action" TEXT,
    "pulse_diagnosis" TEXT,
    "treatment_plan" TEXT,
    "notes" TEXT,
    "drn" TEXT,
    "product_name" TEXT,
    "spy1" TEXT,
    "spy2" TEXT,
    "spy3" TEXT,
    "spy4" TEXT,
    "spy5" TEXT,
    "spy6" TEXT,
    "timing" TEXT,
    "dosage" TEXT,
    "dose_quantity" TEXT,
    "dose_timing" TEXT,
    "dilution" TEXT,
    "addition1" TEXT,
    "addition2" TEXT,
    "addition3" TEXT,
    "procedure" TEXT,
    "presentation" TEXT,
    "bottle_size" TEXT,
    "quantity" INTEGER,
    "administration" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "default_treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_default_template_sync" (
    "id" SERIAL NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "template_type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "populated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_default_template_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "default_products_version_idx" ON "default_products"("version");

-- CreateIndex
CREATE INDEX "default_treatments_version_idx" ON "default_treatments"("version");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_default_template_sync_clinic_id_template_type_version_key" ON "clinic_default_template_sync"("clinic_id", "template_type", "version");

-- CreateIndex
CREATE INDEX "clinic_default_template_sync_template_type_version_idx" ON "clinic_default_template_sync"("template_type", "version");

-- AddForeignKey
ALTER TABLE "clinic_default_template_sync" ADD CONSTRAINT "clinic_default_template_sync_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
