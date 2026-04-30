## Submission Details

- Names with Roll Numbers: Kushagra Juneja (2210990533), Janvi Jain (2210990430), Vishal Raj (2210992537)
- Project Title: **ERP Flow Studios - An Intelligent Clinic Management System**
- Project Type: Copyright
- Team Details: Kushagra Juneja (2210990533), Janvi Jain (2210990430), Vishal Raj (2210992537)
- Submission Status: Waiting

## Status Screenshot

![Submission Status Screenshot](IPR_Document/Status_Screenshot.png)

# ERP Flow Studios — An Intelligent Clinic Management System

> **Version 2.7.0** · Full-stack clinic ERP · Web + Android + iOS + Desktop

A production-ready, multi-tenant healthcare ERP platform built for modern clinics. Covers the full patient lifecycle — from appointment tokens to prescriptions, pharmacy inventory, billing, analytics, and AI-powered tools.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (TypeScript) |
| Database | PostgreSQL via Prisma ORM |
| Styling | Tailwind CSS |
| Mobile | Capacitor (Android & iOS) |
| Desktop | Electron |
| Deployment | Vercel (web) + GitHub Actions |
| AI | Google Gemini (bill parsing) |
| OCR | Tesseract.js + Google Vision API |
| Auth | Custom JWT + session tokens |

---

## Features

### Patient Management
- Patient registration with Aadhaar scan (OCR)
- Visit history, diagnosis notes, prescriptions
- Prescription-to-bill conversion
- Patient token queue system with real-time status
- Import patients via CSV

### Pharmacy & Inventory
- Full product catalog with batch tracking
- Receive goods via AI-parsed bill upload (PDF / photo)
- Demand forecasting with visual analytics
- Low-stock alerts and reorder suggestions
- Sales recording with GST support

### AI Bill Processing
- **Pro plan**: Google Vision OCR → Gemini AI structured extraction
- **Basic plan**: Tesseract OCR (incl. scanned PDFs via pdfjs-dist) → Gemini AI
- Intelligent product name fuzzy-matching against inventory
- 3-step modal UI: Upload → Processing → Results with animated reveal

### Billing & Finance
- Customer invoice generation (PDF export)
- GST-aware sales (CGST / SGST / IGST)
- Supplier bill management
- Google Drive upload for bill archiving

### Clinic Management
- Multi-user roles: Admin, Doctor, Receptionist, Pharmacist
- Multi-account fast-switch
- Geo-access approval for remote logins
- Subscription plans (Basic / Pro) with feature gating
- Clinic public page editor (about, services, gallery, contact)

### Analytics & Reports
- Revenue, patient visit, and product sales charts
- Demand trend graphs
- Exportable reports

### Cross-Platform
- **Web**: Deployed on Vercel at `erpflowstudios.com`
- **Android / iOS**: Capacitor wrapper with video splash screen
- **Desktop**: Electron app with custom splash screen and auto-updater
- **PWA-ready**: Offline banner, service worker compatible

---