import LlamaCloud from '@llamaindex/llama-cloud';
import fs from 'fs';

const client = new LlamaCloud({ apiKey: process.env.LLAMA_CLOUD_API_KEY });

console.log('Uploading file...');

// Upload and parse a document
const fileObj = await client.files.create({
file: fs.createReadStream('./attention_is_all_you_need.pdf'),
purpose: 'parse',
});

console.log('Parsing file...');

const result = await client.parsing.parse({
file_id: fileObj.id,
tier: 'agentic',
version: 'latest',

    // Options specific to the input file type, e.g. html, spreadsheet, presentation, etc.
    input_options: {},

    // Control the output structure and markdown styling
    output_options: {
        markdown: {
            tables: {
                output_tables_as_markdown: false,
            },
        },
        // Saving images for later retrieval
        images_to_save: ['screenshot'],
    },

    // Options for controlling how we process the document
    processing_options: {
        ignore: {
            ignore_diagonal_text: true,
        },
        ocr_parameters: {
            languages: ['en'],
        },
    },

    // Parsed content to include in the returned response
    expand: ['text', 'markdown', 'items', 'images_content_metadata'],

});

console.log(result.markdown.pages[0].markdown);
console.log(result.text.pages[0].text);

// Iterate over page items to find tables
for (const page of result.items.pages) {
for (const item of page.items) {
if (item.type === 'table') {
console.log(
`Table found on page ${page.page_number} with ${item.rows.length} rows and ${JSON.stringify(item.bbox)} location`
);
}
}
}

const isPageScreenshot = (imageName) => /^page\_(\d+)\.jpg$/.test(imageName);

// Iterate over results looking for page screenshots
for (const image of result.images_content_metadata.images) {
if (!image.presigned_url || !isPageScreenshot(image.filename)) {
continue;
}

    console.log(`Downloading ${image.filename}, ${image.size_bytes} bytes`);
    const response = await fetch(image.presigned_url);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(image.filename, buffer);

}
