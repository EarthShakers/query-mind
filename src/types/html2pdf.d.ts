declare module "html2pdf.js" {
  interface Html2PdfInstance {
    set(opt: Record<string, unknown>): Html2PdfInstance;
    from(element: HTMLElement): Html2PdfInstance;
    save(): Promise<void>;
  }

  function html2pdf(): Html2PdfInstance;
  export default html2pdf;
}
