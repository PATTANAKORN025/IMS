import os
import math
import random
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageChops

img_path = "assets/apex-ldi-noc-banner.jpg"
out_path = "assets/apex-ldi-noc-banner.gif"

print("Loading base image...")
base_img = Image.open(img_path).convert("RGBA")
width, height = base_img.size

# Enhance contrast and saturation for a punchy look
base_img = ImageEnhance.Color(base_img).enhance(1.25)
base_img = ImageEnhance.Contrast(base_img).enhance(1.15)

# Pre-generate CRT overlay (Subtle scanlines)
crt_overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
crt_draw = ImageDraw.Draw(crt_overlay)
for y in range(0, height, 3):
    crt_draw.line([(0, y), (width, y)], fill=(0, 0, 0, 35), width=1)

# Paste CRT onto base
base_with_crt = Image.alpha_composite(base_img, crt_overlay)

num_frames = 60 # Ultra-smooth 60 frames
frames = []
scanline_height = int(height * 0.20)

print("Rendering high-fidelity frames...")
for i in range(num_frames):
    frame = base_with_crt.copy()
    draw = ImageDraw.Draw(frame, "RGBA")
    
    progress = i / num_frames
    y_pos = int(progress * (height + scanline_height)) - scanline_height
    
    # 1. Draw gradient scanner tail (Cyberpunk Cyan)
    for offset in range(scanline_height):
        current_y = y_pos + offset
        if 0 <= current_y < height:
            # Exponential fade for a realistic light falloff
            alpha_ratio = (offset / scanline_height) ** 2
            alpha = int(120 * alpha_ratio)
            draw.line([(0, current_y), (width, current_y)], fill=(0, 242, 254, alpha), width=1)
            
    # 2. Draw intense leading edge (Laser)
    edge_y = y_pos + scanline_height
    if 0 <= edge_y < height:
        draw.line([(0, edge_y), (width, edge_y)], fill=(0, 242, 254, 255), width=2)
        draw.line([(0, edge_y-1), (width, edge_y-1)], fill=(255, 255, 255, 220), width=1)
        
    # 3. Holographic / Digital Glitch FX (Cinematic)
    if i in [12, 13, 38, 39, 40, 55]:
        # Random slice displacement
        slice_height = random.randint(15, 60)
        slice_y = random.randint(0, height - slice_height)
        shift_x = random.randint(10, 40) * random.choice([-1, 1])
        
        box = (0, slice_y, width, slice_y + slice_height)
        region = frame.crop(box)
        frame.paste(region, (shift_x, slice_y))
        
        # Chromatic aberration
        r, g, b, a = frame.split()
        r = ImageChops.offset(r, random.randint(-6, 6), 0)
        b = ImageChops.offset(b, random.randint(-6, 6), 0)
        frame = Image.merge("RGBA", (r, g, b, a))
        
        # Flash brightness
        frame = ImageEnhance.Brightness(frame).enhance(1.4)
        
    # 4. Global Pulsing Grid Data Glow
    pulse = int(math.sin(progress * math.pi * 6) * 20)
    if pulse > 0:
        pulse_overlay = Image.new("RGBA", (width, height), (0, 242, 254, pulse))
        frame = Image.alpha_composite(frame, pulse_overlay)

    # Append final frame
    frames.append(frame.convert("RGB"))

print("Encoding world-class GIF (25 FPS)...")
frames[0].save(
    out_path, 
    save_all=True, 
    append_images=frames[1:], 
    duration=40,
    loop=0,
    optimize=False
)
print("SUCCESS: High-end Cyberpunk NOC Banner saved to " + out_path)

