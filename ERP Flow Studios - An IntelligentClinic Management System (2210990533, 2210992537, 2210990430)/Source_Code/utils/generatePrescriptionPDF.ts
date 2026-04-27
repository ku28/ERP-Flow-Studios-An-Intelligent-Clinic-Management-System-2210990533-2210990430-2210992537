import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PrescriptionData {
    visit: any;
    patient: any;
    prescriptions: any[];
    products: any[];
    clinicImages?: {
        header?: string;
        footer?: string;
        signature?: string;
        watermark?: string;
    };
}

export const generatePrescriptionPDF = async (data: PrescriptionData) => {
    const { visit, patient, prescriptions, products, clinicImages } = data;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Add watermark/background image if available
    const addWatermark = async () => {
        // Use clinic watermark image or fallback to default
        const watermarkUrl = clinicImages?.watermark || '';
        try {
            const img = new Image();
            img.crossOrigin = 'Anonymous'; 

            return new Promise((resolve) => {
                img.onload = () => {
                    doc.addImage(img, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
                    resolve(true);
                };
                img.onerror = () => resolve(false);
                img.src = watermarkUrl;
            });
        } catch (error) {
            return false;
        }
    };

    // await addWatermark();

    let yPos = 15;

    // ===== TOP LEFT SECTION (Blue Bordered Boxes) =====
    const drawBlueBox = (x: number, y: number, width: number, height: number, label: string, value: string, valueColor: [number, number, number] = [0, 0, 255]) => {
        doc.setDrawColor(37, 99, 235); // Blue border
        doc.setFillColor(239, 246, 255); // Light blue background
        doc.rect(x, y, width, height, 'FD');

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(label, x + 2, y + 4);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...valueColor);
        doc.setFontSize(8);
        doc.text(value, x + 2, y + height - 2);
    };

    // Top left boxes
    drawBlueBox(10, 10, 25, 10, 'OPDNo.', visit.opdNo || 'N/A', [0, 0, 255]);
    drawBlueBox(10, 22, 25, 10, 'Date', new Date(visit.date).toLocaleDateString('en-GB'), [0, 0, 0]);
    drawBlueBox(10, 34, 25, 10, 'Mob/Ph', patient?.phone || 'N/A', [0, 0, 255]);
    drawBlueBox(10, 46, 25, 8, 'Wt', visit.weight ? `${visit.weight}` : '-', [0, 0, 0]);
    drawBlueBox(10, 56, 25, 8, 'Temp', visit.temperature || 'N/A', [0, 0, 0]);

    // ===== TOP RIGHT SECTION (Patient Details) =====
    const rightColX = 100;
    yPos = 12;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Patient Name:', rightColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 0, 0);
    doc.text(`${patient?.firstName || ''} ${patient?.lastName || ''}`.toUpperCase(), rightColX + 28, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('F/H/G Name:', rightColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(patient?.fatherHusbandGuardianName?.toUpperCase() || 'N/A', rightColX + 28, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Address:', rightColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(patient?.address?.toUpperCase() || 'N/A', rightColX + 28, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Age/DOB:', rightColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${visit.age || patient?.age || 'N/A'} YR`, rightColX + 28, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Sex:', rightColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(patient?.gender?.toUpperCase() || 'N/A', rightColX + 28, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Visit:', rightColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${visit.visitNumber || '1'}`, rightColX + 28, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Ht:', rightColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(visit.height ? `${visit.height} cm` : 'N/A', rightColX + 28, yPos);

    // ===== PULSE DIAGNOSIS SECTION =====
    yPos = 68;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Pulse Diag:', 10, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 255);
    doc.setFontSize(8);
    const pulseDiag = [visit.pulseDiagnosis, visit.pulseDiagnosis2].filter(Boolean).join(', ').toUpperCase();
    doc.text(pulseDiag || 'N/A', 28, yPos);

    // ===== HISTORY / REPORTS SECTION =====
    yPos += 6;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Hist/Reports:', 10, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 0, 0); // Red color
    doc.setFontSize(7);
    const historyText = visit.historyReports?.toUpperCase() || 'N/A';
    const splitHistory = doc.splitTextToSize(historyText, 180);
    doc.text(splitHistory, 28, yPos);
    yPos += splitHistory.length * 4;

    // ===== CHIEF COMPLAINTS SECTION =====
    yPos += 2;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Ch Comp:', 10, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 255); // Blue color
    doc.setFontSize(8);
    const complaints = visit.majorComplaints?.toUpperCase() || 'N/A';
    const splitComplaints = doc.splitTextToSize(complaints, 180);
    doc.text(splitComplaints, 28, yPos);
    yPos += splitComplaints.length * 4;

    // ===== IMPROVEMENTS SECTION =====
    if (visit.improvements) {
        yPos += 2;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Imp:', 10, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 0, 0);
        doc.setFontSize(7);
        const improvements = visit.improvements.toUpperCase();
        const splitImprovements = doc.splitTextToSize(improvements, 180);
        doc.text(splitImprovements, 28, yPos);
        yPos += splitImprovements.length * 4;
    }

    // ===== DIAGNOSIS SECTION (Bordered Box) =====
    yPos += 3;
    doc.setDrawColor(200, 0, 0);
    doc.setFillColor(255, 240, 240);
    doc.rect(10, yPos - 4, 190, 10, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 0, 0);
    doc.text('DISC:', 12, yPos);
    doc.setFontSize(9);
    const diagnosis = visit.provisionalDiagnosis?.toUpperCase() || 'N/A';
    doc.text(diagnosis, 25, yPos);

    // ===== PRESCRIPTION TABLE =====
    yPos += 12;

    // Filter out MISC category products from display (they are droppers/bottles, not medicines for patient)
    const displayPrescriptions = prescriptions.filter((pr: any) => {
        const product = products.find((p: any) => String(p.id) === String(pr.productId));
        const categoryName = product?.category?.name || product?.category || '';
        return categoryName.toLowerCase() !== 'misc';
    });

    const tableData = displayPrescriptions.map((pr: any, index: number) => {
        const product = products.find((p: any) => String(p.id) === String(pr.productId));
            return [
            String(index + 1),
            product?.name?.toUpperCase() || 'MEDICINE',
            pr.dosage || '-',
            pr.frequency || '-',
            pr.duration || '-',
            pr.route || '-',
            pr.timing?.toUpperCase() || '-',
            pr.quantity || '1',
            product?.priceRupees ? `₹${Number(product.priceRupees).toFixed(2)}` : '-',
            product?.priceRupees ? `₹${(Number(product.priceRupees) * (parseInt(pr.quantity) || 1)).toFixed(2)}` : '-'
        ];
    });

    autoTable(doc, {
        startY: yPos,
        head: [['#', 'DRP SUGARFREE/TABS', 'DOSE', 'FREQ', 'DUR', 'ROUTE', 'TIMING', 'QTY', 'RATE', 'AMT']],
        body: tableData,
        styles: {
            fontSize: 7,
            cellPadding: 1,
            lineColor: [200, 200, 200],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [230, 230, 230],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            fontSize: 6,
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 6, halign: 'center' },   // #
            1: { cellWidth: 45, halign: 'left' },    // Medicine name
            2: { cellWidth: 15, halign: 'center' },  // Dose
            3: { cellWidth: 12, halign: 'center' },  // Freq
            4: { cellWidth: 12, halign: 'center' },  // Dur
            5: { cellWidth: 15, halign: 'center' },  // Route
            6: { cellWidth: 30, halign: 'center' },  // Timing
            7: { cellWidth: 10, halign: 'center' },  // Qty
            8: { cellWidth: 15, halign: 'right' },   // Rate
            9: { cellWidth: 15, halign: 'right' }    // Amt
        },
        alternateRowStyles: {
            fillColor: [250, 250, 250]
        },
        didDrawCell: (data: any) => {
            // Color medicine names in blue
            if (data.column.index === 1 && data.section === 'body') {
                doc.setTextColor(0, 0, 255);
            }
            // Color timing in red
            if (data.column.index === 6 && data.section === 'body') {
                doc.setTextColor(200, 0, 0);
            }
        }
    });

    // ===== FINANCIAL INFORMATION (Bottom Right) =====
    const finalY = (doc as any).lastAutoTable.finalY + 5;
    const finX = 150;
    let finY = finalY;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    // Calculate total of all medicines (excluding MISC category - droppers/bottles)
    const medicinesTotal = prescriptions.reduce((sum: number, pr: any) => {
        const product = products.find((p: any) => String(p.id) === String(pr.productId));
        const categoryName = product?.category?.name || product?.category || '';
        // Skip MISC category products (droppers/bottles) from pricing calculations
        if (categoryName.toLowerCase() === 'misc') {
            return sum;
        }
        const price = product?.priceRupees || 0;
        const quantity = parseInt(pr.quantity) || 1;
        return sum + (Number(price) * quantity);
    }, 0);

    doc.text('Total:', finX, finY);
    doc.text(`₹${medicinesTotal.toFixed(2)}`, finX + 30, finY);

    finY += 5;
    doc.text('Discount:', finX, finY);
    doc.text(`₹${visit.discount || '0.00'}`, finX + 30, finY);

    const consultationFeesValue = visit.consultationFees || 0;
    if (consultationFeesValue > 0) {
        finY += 5;
        doc.text('Consultation Fees:', finX, finY);
        doc.text(`₹${consultationFeesValue.toFixed(2)}`, finX + 30, finY);
    }

    finY += 6;
    // Amount = Balance Due + Payment Received
    const balanceDue = parseFloat(visit.balance) || 0;
    const paymentReceived = parseFloat(visit.payment) || 0;
    const amount = balanceDue + paymentReceived;

    // Highlighted amount
    doc.setDrawColor(255, 200, 0);
    doc.setFillColor(255, 255, 200);
    doc.rect(finX - 2, finY - 4, 48, 7, 'FD');
    doc.setFontSize(9);
    doc.text('AMOUNT:', finX, finY);
    doc.text(`₹${amount.toFixed(2)}`, finX + 30, finY);

    finY += 6;
    doc.setFontSize(8);
    doc.text('Payment:', finX, finY);
    doc.text(`₹${visit.payment || '0.00'}`, finX + 30, finY);

    finY += 5;
    doc.text('Balance Due:', finX, finY);
    doc.text(`₹${visit.balance || '0.00'}`, finX + 30, finY);

    // ===== FOOTER =====
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text('Designed by DrugBase', pageWidth - 40, pageHeight - 5);

    // Save the PDF
    doc.save(`prescription_${visit.opdNo}_${Date.now()}.pdf`);
};
