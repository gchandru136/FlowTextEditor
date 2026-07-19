# Playground images

The sample email template (`playground/src/sample-email.html`) references images
with relative paths like `images/image-1.png`. Vite serves everything in
`playground/public/` from the site root, so those files resolve to `/images/...`.

**Drop your exported template images here** using these exact filenames:

| File          | Used for          |
| ------------- | ----------------- |
| `image-1.png` | Hero illustration |
| `image-2.png` | Star rating       |
| `image-3.png` | Facebook icon     |
| `image-4.png` | Twitter icon      |
| `image-5.png` | LinkedIn icon     |
| `image-6.png` | Instagram icon    |

Until they're added, those spots render as broken-image placeholders — the rest
of the template (text, layout, button) previews fine.

> This folder is playground-only and is **not** part of the published npm package.
