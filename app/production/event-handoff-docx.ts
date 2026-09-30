import { strToU8, zipSync } from "fflate";
import type { SharedEventPlan, SharedHandoff } from "./shared-event-model";

const xml = (value: unknown) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const paragraph = (value: string, style: "Title"|"Heading1"|"Normal" = "Normal") => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`;

export function handoffDocx(event: SharedEventPlan, handoff: SharedHandoff): Uint8Array {
  if (handoff.status === "draft") throw new Error("Complete the handoff before downloading it.");
  const sections: Array<[string,string]> = [
    ["Role and responsibilities",handoff.document.roleDuties],
    ["Event history",handoff.document.eventHistory],
    ["Event metrics",handoff.document.metrics],
    ["Analytics and interpretation",handoff.document.analytics],
    ["Open decisions",handoff.document.openDecisions],
    ["Next actions",handoff.document.nextActions],
  ];
  const content = [paragraph(`${event.title} coordination handoff`,"Title"),
    paragraph(`Version ${handoff.version} · ${event.ownerExperience === "genesis" ? "Impact Studio" : "OACA"}`),
    paragraph("This handoff records how the event was coordinated, what happened, and the decisions the next organizer needs to make."),
    ...sections.flatMap(([title,body])=>[paragraph(title,"Heading1"),...body.split(/\r?\n/).map((line)=>paragraph(line))])].join("");
  const files = {
    "[Content_Types].xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    "_rels/.rels":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "word/document.xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1440" w:bottom="1200" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:color w:val="000000"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="260" w:after="100"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,strToU8(value)])),{level:6});
}
