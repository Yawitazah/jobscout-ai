from __future__ import annotations

import io
import logging
import os

logger = logging.getLogger(__name__)


def build_docx(content_json: dict, full_name: str) -> bytes:
    """Return DOCX bytes from a tailored resume JSON."""
    from docx import Document
    from docx.shared import Pt

    doc = Document()

    heading = doc.add_heading(full_name, level=0)
    heading.alignment = 1  # center

    if content_json.get("summary"):
        doc.add_paragraph(content_json["summary"])

    if content_json.get("skills"):
        doc.add_heading("Skills", level=1)
        doc.add_paragraph(", ".join(content_json["skills"]))

    if content_json.get("experience"):
        doc.add_heading("Experience", level=1)
        for exp in content_json["experience"]:
            p = doc.add_paragraph()
            run = p.add_run(f"{exp.get('title', '')} — {exp.get('company', '')}")
            run.bold = True
            dates = f"{exp.get('start_date') or ''} – {exp.get('end_date') or 'Present'}"
            doc.add_paragraph(dates).runs[0].italic = True if doc.paragraphs[-1].runs else False
            for bullet in exp.get("bullets", []):
                doc.add_paragraph(bullet, style="List Bullet")

    if content_json.get("education"):
        doc.add_heading("Education", level=1)
        for edu in content_json["education"]:
            p = doc.add_paragraph()
            run = p.add_run(f"{edu.get('degree', '')} — {edu.get('institution', '')}")
            run.bold = True
            if edu.get("graduation_year"):
                doc.add_paragraph(edu["graduation_year"])

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_pdf(content_json: dict, full_name: str) -> bytes:
    """Return PDF bytes rendered from the resume HTML template via WeasyPrint."""
    from jinja2 import Environment, FileSystemLoader
    from weasyprint import HTML

    templates_dir = os.path.join(os.path.dirname(__file__), "../../templates")
    env = Environment(loader=FileSystemLoader(os.path.abspath(templates_dir)))
    template = env.get_template("resume.html")
    html_str = template.render(full_name=full_name, resume=content_json)

    pdf_bytes: bytes = HTML(string=html_str).write_pdf()
    return pdf_bytes
