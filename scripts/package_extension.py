import os
import zipfile

src_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'chrome-extension'))
out_zip = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'streamclip-ai-chrome-extension.zip'))

print(f"Packaging {src_dir} -> {out_zip}")
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(src_dir):
        for file in sorted(files):
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, src_dir)
            zipf.write(full_path, rel_path)
            print(f" + {rel_path}")

print(f"Package created successfully! ({os.path.getsize(out_zip)} bytes)")
