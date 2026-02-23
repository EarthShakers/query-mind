export async function exportToPdf(
  element: HTMLElement,
  title: string
): Promise<void> {
  // Dynamic import to avoid SSR issues
  const html2pdf = (await import("html2pdf.js")).default;

  const opt = {
    margin: 10,
    filename: `${title || "报告"}.pdf`,
    image: { type: "jpeg" as const, quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
  };

  await html2pdf().set(opt).from(element).save();
}
