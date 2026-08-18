import os
from PIL import Image, ImageDraw, ImageEnhance

img_path = 'assets/apex-ldi-noc-banner.jpg'
out_path = 'assets/apex-ldi-noc-banner.gif'

print("Loading image...")
img = Image.open(img_path).convert('RGBA')
width, height = img.size

frames = []
scanline_height = height // 12
num_frames = 24

print("Generating frames...")
for i in range(num_frames):
    frame = Image.new('RGBA', (width, height))
    frame.paste(img, (0,0))
    
    draw = ImageDraw.Draw(frame, 'RGBA')
    
    # Calculate scanline position
    y_pos = int((i / num_frames) * height)
    
    # Draw a glowing cyan scanline overlay
    draw.rectangle([0, y_pos, width, y_pos + scanline_height], fill=(0, 242, 254, 40))
    draw.line([(0, y_pos), (width, y_pos)], fill=(0, 242, 254, 180), width=3)
    draw.line([(0, y_pos + scanline_height), (width, y_pos + scanline_height)], fill=(0, 242, 254, 100), width=1)
    
    # Optional: slight color shift for glitch effect every few frames
    if i % 8 == 0:
        # Create a slightly offset RGB split effect (chromatic aberration)
        r, g, b, a = frame.split()
        r = r.transform((width, height), Image.AFFINE, (1, 0, 4, 0, 1, 0))
        b = b.transform((width, height), Image.AFFINE, (1, 0, -4, 0, 1, 0))
        frame = Image.merge('RGBA', (r, g, b, a))
        
        # Boost brightness slightly on glitch frames
        enhancer_brightness = ImageEnhance.Brightness(frame)
        frame = enhancer_brightness.enhance(1.15)
        
    # Convert RGBA back to RGB for GIF (with adaptive palette)
    # Using P mode for GIF
    rgb_frame = frame.convert('RGB')
    frames.append(rgb_frame)

print("Saving GIF (this might take a moment)...")
frames[0].save(
    out_path, 
    save_all=True, 
    append_images=frames[1:], 
    duration=80, 
    loop=0,
    optimize=True
)
print('GIF banner generated successfully.')
