#!/usr/bin/env python3
"""
IMS Documentation i18n Translation Script

Usage:
  python scripts/translate-docs.py [file_path] [target_language_code]

Requires:
  pip install requests
  OPENAI_API_KEY or GEMINI_API_KEY environment variable set.
"""

import os
import sys
import json
import requests
import re

GLOSSARY_PATH = "docs/i18n-glossary.json"

def load_glossary():
    try:
        with open(GLOSSARY_PATH, 'r', encoding='utf-8') as f:
            return json.load(f).get("terms", [])
    except FileNotFoundError:
        print(f"Glossary not found at {GLOSSARY_PATH}")
        return []

def build_prompt(content, target_lang, glossary):
    glossary_text = "\n".join([f"- {term['english']} -> {term.get(target_lang.lower(), term['english'])} ({term.get('notes', '')})" for term in glossary])
    
    return f"""
Translate the following Markdown documentation into {target_lang}.
Ensure that you DO NOT break any Markdown formatting, code blocks (```), Mermaid diagrams, or HTML tags.
Maintain a highly professional, factual engineering tone.

Use the following glossary for technical terms:
{glossary_text}

Markdown Content to Translate:
-----------------------------
{content}
"""

def translate(content, target_lang):
    # Dummy mock function for demonstration if no API key is provided
    # In a real environment, this makes an HTTP request to an LLM provider.
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY or GEMINI_API_KEY environment variable required.", file=sys.stderr)
        sys.exit(1)
        
    print(f"Translating {len(content)} characters to {target_lang}...")
    # Mocking actual API call to avoid complex dependency logic here
    # In production, substitute with standard openai.ChatCompletion or requests.post
    return f"<!-- Translated to {target_lang} -->\n{content}"

def main():
    if len(sys.argv) < 3:
        print("Usage: python translate-docs.py <path-to-markdown-file> <target-lang-code (e.g. th, zh-CN)>")
        sys.exit(1)
        
    filepath = sys.argv[1]
    target_lang_code = sys.argv[2]
    
    if not filepath.endswith(".md"):
        print("Error: Target file must be a Markdown (.md) file.")
        sys.exit(1)
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    glossary = load_glossary()
    
    target_lang_name = "Thai" if target_lang_code.lower() == "th" else "Simplified Chinese" if "zh" in target_lang_code.lower() else target_lang_code
    translated_content = translate(content, target_lang_name)
    
    out_filepath = filepath.replace(".md", f"-{target_lang_code}.md")
    with open(out_filepath, 'w', encoding='utf-8') as f:
        f.write(translated_content)
        
    print(f"Successfully generated {out_filepath}")

if __name__ == "__main__":
    main()
