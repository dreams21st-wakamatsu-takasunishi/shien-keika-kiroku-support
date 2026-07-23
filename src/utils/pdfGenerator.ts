import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Captures an HTML element and exports it as a clean A4 PDF file.
 */
export async function generatePDFFromElement(
  elementId: string,
  filename: string = '支援経過記録.pdf'
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Target element #${elementId} not found for PDF export.`);
  }

  // Temporary styling tweaks for optimal screenshot quality
  const originalWidth = element.style.width;
  element.style.width = '800px'; // standard A4 printable width target in DOM

  try {
    const canvas = await html2canvas(element, {
      scale: 2, // High resolution capture
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1024,
    });

    element.style.width = originalWidth;

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // First page
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Subsequent pages if long content
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  } catch (error) {
    element.style.width = originalWidth;
    console.error('PDF export error:', error);
    throw error;
  }
}
