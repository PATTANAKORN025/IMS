import os
import math
import random
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageChops

img_path = "assets/apex-ldi-noc-banner.jpg"
out_path = "assets/apex-ldi-noc-banner.gif"

print("Loading base image...")
base_img = Image.open(img_path).convert("RGBA")
width, height = base_img.size

# Enhance base image for a dark cinematic look
base_img = ImageEnhance.Color(base_img).enhance(1.3)
base_img = ImageEnhance.Contrast(base_img).enhance(1.2)
base_img = ImageEnhance.Brightness(base_img).enhance(0.85)

# Pre-generate CRT overlay
crt_overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
crt_draw = ImageDraw.Draw(crt_overlay)
for y in range(0, height, 3):
    crt_draw.line([(0, y), (width, y)], fill=(0, 0, 0, 40), width=1)

base_with_crt = Image.alpha_composite(base_img, crt_overlay)

num_frames = 60 # 60 frames for a smooth 2.4 second loop at 25fps
frames = []

def draw_hud_arc(draw, center, radius, start, end, color, width):
    draw.arc([center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius], start, end, fill=color, width=width)

print("Rendering 2.5D Cinematic frames with Data Flow & HUD...")
for i in range(num_frames):
    progress = i / num_frames
    
    # 1. 2.5D Camera Breathing (Zoom and Pan for simulated 3D depth)
    # Scale fluctuates smoothly between 1.0 and 1.04
    scale = 1.0 + (math.sin(progress * math.pi * 2) + 1) * 0.02
    new_w = int(width * scale)
    new_h = int(height * scale)
    
    scaled_img = base_with_crt.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Center crop to simulate camera movement
    left = (new_w - width) // 2
    top = (new_h - height) // 2
    frame = scaled_img.crop((left, top, left + width, top + height))
    
    draw = ImageDraw.Draw(frame, "RGBA")
    
    # 2. 3D Perspective Data Grid (Floor)
    grid_y_start = int(height * 0.65)
    vanishing_x = width // 2
    
    # Vertical perspective lines
    for j in range(-12, 13):
        x_bottom = vanishing_x + j * 150
        x_top = vanishing_x + j * 20
        draw.line([(x_top, grid_y_start), (x_bottom, height)], fill=(0, 242, 254, 15), width=1)
        
    # Moving horizontal grid lines (flowing towards the viewer)
    grid_prog = (progress * 4) % 1.0
    for j in range(1, 8):
        y_offset = (j + grid_prog) / 8.0
        # Exponential curve creates the illusion of 3D depth
        y = grid_y_start + int((y_offset ** 2.5) * (height - grid_y_start))
        if y < height:
            alpha = int(80 * y_offset)
            draw.line([(0, y), (width, y)], fill=(0, 242, 254, alpha), width=1)
            
    # 3. Flowing Data Streams (Particles moving along curves)
    for j in range(8):
        stream_prog = (progress + j/8.0) % 1.0
        x = int(width * 0.1 + stream_prog * width * 0.8)
        y = int(height * 0.4 + math.sin(stream_prog * math.pi * 4) * 50)
        
        # Glowing particle
        draw.ellipse([x-3, y-3, x+3, y+3], fill=(255, 255, 255, 255))
        draw.ellipse([x-6, y-6, x+6, y+6], fill=(0, 242, 254, 150))
        # Data Trail
        draw.line([(x-40, y), (x, y)], fill=(0, 242, 254, 80), width=2)
        
    # 4. Rotating Cyberpunk HUD Elements
    cx, cy = int(width * 0.85), int(height * 0.25)
    rot = progress * 360
    # Outer Ring
    draw_hud_arc(draw, (cx, cy), 60, rot, rot + 270, (0, 255, 128, 150), 2)
    # Inner Ring (Counter-rotating)
    draw_hud_arc(draw, (cx, cy), 45, -rot*1.5, -rot*1.5 + 180, (0, 242, 254, 200), 3)
    # Crosshair
    draw.line([(cx-70, cy), (cx-20, cy)], fill=(0, 242, 254, 100), width=1)
    draw.line([(cx+20, cy), (cx+70, cy)], fill=(0, 242, 254, 100), width=1)
    draw.line([(cx, cy-70), (cx, cy-20)], fill=(0, 242, 254, 100), width=1)
    draw.line([(cx, cy+20), (cx, cy+70)], fill=(0, 242, 254, 100), width=1)
    
    # 5. Simulated Machine Operation (Blinking Server LEDs)
    # A realistic command center has lots of tiny blinking lights
    for m in range(15):
        # Deterministic random positions based on index
        random.seed(m)
        lx = random.randint(int(width*0.1), int(width*0.9))
        ly = random.randint(int(height*0.3), int(height*0.8))
        blink_rate = random.randint(2, 6)
        
        # Restore random state so subsequent calls are truly random
        random.seed()
        
        # Blink logic
        if int(progress * 60) % blink_rate == 0:
            color = (255, 50, 50, 200) if m % 3 == 0 else (50, 255, 50, 200)
            draw.ellipse([lx, ly, lx+3, ly+3], fill=color)

    # Convert to standard RGB and append
    frames.append(frame.convert("RGB"))

print("Encoding world-class 2.5D Cinematic GIF (25 FPS)...")
frames[0].save(
    out_path, 
    save_all=True, 
    append_images=frames[1:], 
    duration=40,
    loop=0,
    optimize=False
)
print("SUCCESS: 2.5D Cyberpunk NOC Banner saved to " + out_path)

