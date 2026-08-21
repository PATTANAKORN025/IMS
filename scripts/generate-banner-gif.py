import os
import math
import random
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageChops

img_path = "assets/apex-ldi-noc-banner.jpg"
out_path = "assets/apex-ldi-noc-banner.gif"

print("Loading base image...")
base_img = Image.open(img_path).convert("RGBA")
orig_width, orig_height = base_img.size

# Enhance contrast and saturation for a punchy look
base_img = ImageEnhance.Color(base_img).enhance(1.3)
base_img = ImageEnhance.Contrast(base_img).enhance(1.2)

num_frames = 90 # Extended to 90 frames for a longer, cinematic loop
frames = []
scanline_height = int(orig_height * 0.15)

print("Rendering cinematic frames with Ken Burns Zoom & Animation...")
for i in range(num_frames):
    progress = i / float(num_frames)
    
    # --- 1. Cinematic Zoom (Ken Burns Effect) ---
    # Zoom from 1.0x to 1.1x smoothly using sine wave for looping
    zoom_factor = 1.0 + (math.sin(progress * math.pi * 2 - math.pi/2) + 1) / 2 * 0.08
    
    # Calculate crop box for zoom
    new_w = orig_width / zoom_factor
    new_h = orig_height / zoom_factor
    left = (orig_width - new_w) / 2
    top = (orig_height - new_h) / 2
    right = left + new_w
    bottom = top + new_h
    
    # Crop and resize back to original (Creates Zoom)
    frame = base_img.crop((left, top, right, bottom)).resize((orig_width, orig_height), Image.Resampling.LANCZOS)
    
    # Add subtle CRT scanlines on top of the zoomed image so they stay static
    crt_overlay = Image.new("RGBA", (orig_width, orig_height), (0, 0, 0, 0))
    crt_draw = ImageDraw.Draw(crt_overlay)
    for y in range(0, orig_height, 4):
        crt_draw.line([(0, y), (orig_width, y)], fill=(0, 0, 0, 45), width=1)
    frame = Image.alpha_composite(frame, crt_overlay)

    draw = ImageDraw.Draw(frame, "RGBA")
    
    # --- 2. Advanced Cyberpunk Scanner ---
    # Move scanner down smoothly, repeating twice per loop
    scanner_prog = (progress * 2) % 1.0
    y_pos = int(scanner_prog * (orig_height + scanline_height)) - scanline_height
    
    # Scanner gradient tail
    for offset in range(scanline_height):
        current_y = y_pos + offset
        if 0 <= current_y < orig_height:
            alpha_ratio = (offset / scanline_height) ** 3 # Steeper curve
            alpha = int(140 * alpha_ratio)
            draw.line([(0, current_y), (orig_width, current_y)], fill=(0, 242, 254, alpha), width=1)
            
    # Scanner leading laser edge
    edge_y = y_pos + scanline_height
    if 0 <= edge_y < orig_height:
        draw.line([(0, edge_y), (orig_width, edge_y)], fill=(0, 242, 254, 255), width=3)
        draw.line([(0, edge_y-1), (orig_width, edge_y-1)], fill=(255, 255, 255, 255), width=1)
        
    # --- 3. Digital Glitch FX ---
    # Glitch intensely on specific beats
    if i in [15, 16, 60, 61, 85]:
        slice_height = random.randint(20, 80)
        slice_y = random.randint(0, orig_height - slice_height)
        shift_x = random.randint(15, 60) * random.choice([-1, 1])
        
        box = (0, slice_y, orig_width, slice_y + slice_height)
        region = frame.crop(box)
        frame.paste(region, (shift_x, slice_y))
        
        # Intense Chromatic aberration
        r, g, b, a = frame.split()
        r = ImageChops.offset(r, random.randint(-10, 10), 0)
        b = ImageChops.offset(b, random.randint(-10, 10), 0)
        frame = Image.merge("RGBA", (r, g, b, a))
        
        # Brightness strobe
        frame = ImageEnhance.Brightness(frame).enhance(1.6)
        
    # --- 4. Global Data Grid Pulsing ---
    pulse = int(math.sin(progress * math.pi * 8) * 15)
    if pulse > 0:
        pulse_overlay = Image.new("RGBA", (orig_width, orig_height), (0, 242, 254, pulse))
        frame = Image.alpha_composite(frame, pulse_overlay)

    # --- 5. UI Element Overlay Simulation ---
    # Simulate a "LIVE" blinking text in the top right
    if (i // 10) % 2 == 0:
        draw.rectangle([orig_width - 90, 20, orig_width - 20, 50], fill=(255, 0, 60, 200))
        draw.text((orig_width - 70, 27), "LIVE", fill=(255, 255, 255, 255))
    else:
        draw.rectangle([orig_width - 90, 20, orig_width - 20, 50], fill=(255, 0, 60, 50))
        draw.text((orig_width - 70, 27), "LIVE", fill=(255, 255, 255, 100))

    frames.append(frame.convert("RGB"))

print("Encoding cinematic GIF (30 FPS, ultra smooth)...")
frames[0].save(
    out_path, 
    save_all=True, 
    append_images=frames[1:], 
    duration=33, # ~30 FPS
    loop=0,
    optimize=False
)
print("SUCCESS: Masterpiece Animated NOC Banner saved to " + out_path)

