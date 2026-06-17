import os
import sys
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Attempt to import cv2
try:
    import cv2
except ImportError:
    print("OpenCV is not installed. Please run 'pip install opencv-python pillow' first.")
    sys.exit(1)

# Configuration
WIDTH, HEIGHT = 1280, 720
FPS = 30
OUT_FILE = "code_rakshak_ad.mp4"

# Set up fonts
def get_font(font_name, size):
    paths = [
        f"C:/Windows/Fonts/{font_name}.ttf",
        f"C:/Windows/Fonts/{font_name.lower()}.ttf",
        f"C:/Windows/Fonts/{font_name.upper()}.ttf",
        f"C:/Windows/Fonts/arial.ttf",  # fallback
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

# Load specific fonts
font_title = get_font("consolab", 64)       # Cyber header
font_header = get_font("segoeuib", 48)     # Main header
font_body = get_font("segoeui", 22)        # Body text
font_mono = get_font("consola", 20)        # Monospace code/links
font_small = get_font("segoeui", 14)       # Badge text
font_huge = get_font("consolab", 96)       # Huge title/grade

# --- HELPER FUNCTIONS FOR RENDERING ---

def draw_cyber_grid(draw, frame_idx):
    """Draws a moving cyber grid in the background."""
    grid_color = (13, 27, 62, 80)  # semi-transparent dark blue
    offset = (frame_idx * 2) % 40
    
    # Vertical lines
    for x in range(-40, WIDTH + 40, 40):
        draw.line([(x + offset, 0), (x + offset, HEIGHT)], fill=grid_color, width=1)
        
    # Horizontal lines
    for y in range(-40, HEIGHT + 40, 40):
        draw.line([(0, y + offset), (WIDTH, y + offset)], fill=grid_color, width=1)

def draw_particles(draw, particles):
    """Update and draw background particles."""
    for p in particles:
        # Move
        p['x'] += p['vx']
        p['y'] += p['vy']
        if p['x'] < 0 or p['x'] > WIDTH: p['vx'] *= -1
        if p['y'] < 0 or p['y'] > HEIGHT: p['vy'] *= -1
        
        # Pulse alpha
        p['alpha'] += p['da']
        if p['alpha'] > 1.0 or p['alpha'] < 0.2:
            p['da'] *= -1
            p['alpha'] = max(0.2, min(1.0, p['alpha']))
            
        color = p['color']
        alpha_val = int(p['alpha'] * 150)
        p_color = (color[0], color[1], color[2], alpha_val)
        
        # Draw glowing particle
        r = p['r']
        draw.ellipse([(p['x'] - r, p['y'] - r), (p['x'] + r, p['y'] + r)], fill=p_color)

def init_particles():
    particles = []
    for _ in range(80):
        color = (245, 166, 35) if random.random() > 0.5 else (59, 130, 246) # Gold or Blue
        particles.append({
            'x': random.uniform(0, WIDTH),
            'y': random.uniform(0, HEIGHT),
            'vx': random.uniform(-0.8, 0.8),
            'vy': random.uniform(-0.8, 0.8),
            'r': random.uniform(2, 6),
            'alpha': random.uniform(0.2, 0.9),
            'da': random.choice([-0.02, 0.02]),
            'color': color
        })
    return particles

def init_code_rain():
    cols = []
    chars = "010101/*{}[]&|==!==<>;+-"
    for i in range(40):
        cols.append({
            'x': int(i * (WIDTH / 40)),
            'y': random.uniform(-500, 0),
            'speed': random.uniform(3, 8),
            'text': "".join(random.choice(chars) for _ in range(25)),
            'opacity': random.uniform(0.1, 0.4)
        })
    return cols

def draw_code_rain(draw, cols):
    """Draw vertical lines of red hacker code rain."""
    for col in cols:
        col['y'] += col['speed']
        if col['y'] > HEIGHT:
            col['y'] = random.uniform(-300, -50)
            col['speed'] = random.uniform(3, 8)
            
        y = col['y']
        chars = col['text']
        opacity = col['opacity']
        # Render character by character vertically
        for idx, char in enumerate(chars):
            cy = y + idx * 16
            if 0 <= cy < HEIGHT:
                # Fade effect from top to bottom of the column
                alpha = int(opacity * (idx / len(chars)) * 255)
                char_color = (255, 34, 0, alpha)  # Cyber Red
                draw.text((col['x'], cy), char, fill=char_color, font=font_mono)

def draw_gradient_background(draw, center_color, outer_color):
    """Draws a radial gradient approximation."""
    # Since PIL doesn't do radial gradients easily, we draw concentric ellipses with alpha
    # Or a simple top-bottom linear gradient. Linear is cleaner and faster.
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(center_color[0] * (1 - ratio) + outer_color[0] * ratio)
        g = int(center_color[1] * (1 - ratio) + outer_color[1] * ratio)
        b = int(center_color[2] * (1 - ratio) + outer_color[2] * ratio)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

def draw_shield(draw, cx, cy, scale, pulse_offset=0):
    """Draws a glowing gold shield."""
    # Scale shield path
    s = scale * (1.0 + 0.04 * math.sin(pulse_offset))
    # Points defining shield: Top-center, top-right, bottom-right curve, bottom-center, bottom-left curve, top-left
    points = [
        (cx, cy - 70 * s),
        (cx + 60 * s, cy - 50 * s),
        (cx + 60 * s, cy),
        (cx, cy + 80 * s),
        (cx - 60 * s, cy),
        (cx - 60 * s, cy - 50 * s)
    ]
    
    # Outer glow (drawn as larger semi-transparent layers)
    for g_r in range(15, 0, -3):
        g_s = s + g_r * 0.04
        g_pts = [
            (cx, cy - 70 * g_s),
            (cx + 60 * g_s, cy - 50 * g_s),
            (cx + 60 * g_s, cy),
            (cx, cy + 80 * g_s),
            (cx - 60 * g_s, cy),
            (cx - 60 * g_s, cy - 50 * g_s)
        ]
        alpha = int((15 - g_r) * 3)
        draw.polygon(g_pts, fill=(245, 166, 35, alpha))
        
    # Main Shield Body
    draw.polygon(points, fill=(245, 166, 35, 255), outline=(255, 255, 255, 180))
    
    # Inner accent shield
    inner_pts = [
        (cx, cy - 55 * s),
        (cx + 45 * s, cy - 40 * s),
        (cx + 45 * s, cy - 5 * s),
        (cx, cy + 62 * s),
        (cx - 45 * s, cy - 5 * s),
        (cx - 45 * s, cy - 40 * s)
    ]
    draw.polygon(inner_pts, fill=(13, 27, 62, 255))
    
    # Lock emoji or symbol in the middle
    draw.text((cx - 20, cy - 35), "🔒", fill=(255, 255, 255, 255), font=get_font("seguiemj", int(32 * s)))

# --- SCENE RENDERING PIPELINE ---

def render_scene_1(frame_idx, code_rain):
    """Scene 1: Threat Warning (Red warning, hacker rain)"""
    im = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    draw = ImageDraw.Draw(im)
    
    # Red-tinted background gradient
    draw_gradient_background(draw, (20, 0, 0), (5, 0, 0))
    
    # Code rain
    draw_code_rain(draw, code_rain)
    
    # Horizontal glowing crack
    crack_y = HEIGHT // 2
    flicker = 1.0 if (frame_idx % 6 > 2) else 0.4
    crack_color = (255, 34, 0, int(180 * flicker))
    draw.line([(0, crack_y), (WIDTH, crack_y)], fill=crack_color, width=4)
    draw.line([(0, crack_y - 2), (WIDTH, crack_y - 2)], fill=(255, 102, 0, int(100 * flicker)), width=1)
    
    # Text container
    # Pulse scale for warning badge
    pulse = 1.0 + 0.05 * math.sin(frame_idx * 0.15)
    badge_w, badge_h = 160 * pulse, 38 * pulse
    bx1, by1 = (WIDTH - badge_w) // 2, 200 - badge_h // 2
    bx2, by2 = bx1 + badge_w, by1 + badge_h
    
    # Draw warning badge
    draw.rounded_rectangle([bx1, by1, bx2, by2], radius=6, outline=(255, 34, 0, 255), fill=(40, 0, 0, 200), width=2)
    # Text in badge
    draw.text((bx1 + 24 * pulse, by1 + 8 * pulse), "⚠ WARNING", fill=(255, 34, 0, 255), font=font_small)
    
    # Main Warning Header
    t1 = "Your code has vulnerabilities."
    tw1 = draw.textlength(t1, font=font_header)
    draw.text(((WIDTH - tw1)//2, 280), t1, fill=(255, 255, 255, 255), font=font_header)
    
    # Highlights / Subtitle
    t2 = "SQL Injection  ·  Hardcoded Secrets  ·  OWASP Top 10  ·  Logic Bugs"
    tw2 = draw.textlength(t2, font=font_body)
    draw.text(((WIDTH - tw2)//2, 380), t2, fill=(200, 200, 200, 255), font=font_body)
    
    # Hacker overlay prompt line
    t3 = "SCANNING PRE-COMMIT HOOKS..." if (frame_idx % 30 > 15) else "SCANNING PRE-COMMIT HOOKS"
    draw.text((40, HEIGHT - 50), t3, fill=(255, 34, 0, 150), font=font_mono)
    
    return im

def render_scene_2(frame_idx, particles):
    """Scene 2: Shield Reveal (Golden shield, rings expanding, project title)"""
    im = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    draw = ImageDraw.Draw(im)
    
    # Blue cyber gradient background
    draw_gradient_background(draw, (13, 27, 62), (5, 10, 20))
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, particles)
    
    cx, cy = WIDTH // 2, HEIGHT // 2 - 80
    
    # Draw expanding golden shockwave rings
    # Rings expand and fade out
    ring_period = 60  # frames
    for ring_offset in [0, 20, 40]:
        r_frame = (frame_idx + ring_offset) % ring_period
        scale = 0.5 + (r_frame / ring_period) * 1.5
        alpha = int((1.0 - (r_frame / ring_period)) * 120)
        radius = int(100 * scale)
        if alpha > 0:
            draw.ellipse([(cx - radius, cy - radius), (cx + radius, cy + radius)], 
                         outline=(245, 166, 35, alpha), width=3)
            
    # Shield in center
    draw_shield(draw, cx, cy, scale=1.2, pulse_offset=frame_idx * 0.1)
    
    # Project Title
    t1_c = "CODE"
    t1_r = " RAKSHAK"
    # Measure texts
    w_c = draw.textlength(t1_c, font=font_title)
    w_r = draw.textlength(t1_r, font=font_title)
    total_w = w_c + w_r
    
    tx = (WIDTH - total_w) // 2
    ty = HEIGHT - 200
    
    # Glowing effect on text
    for offset in range(1, 5):
        draw.text((tx - offset, ty), t1_c, fill=(245, 166, 35, 30), font=font_title)
        draw.text((tx + w_c - offset, ty), t1_r, fill=(255, 255, 255, 30), font=font_title)
        draw.text((tx + offset, ty), t1_c, fill=(245, 166, 35, 30), font=font_title)
        draw.text((tx + w_c + offset, ty), t1_r, fill=(255, 255, 255, 30), font=font_title)
        
    draw.text((tx, ty), t1_c, fill=(245, 166, 35, 255), font=font_title)
    draw.text((tx + w_c, ty), t1_r, fill=(255, 255, 255, 255), font=font_title)
    
    # Subtitle
    t2 = "Your Code's Guardian  ·  रक्षक"
    tw2 = draw.textlength(t2, font=font_body)
    draw.text(((WIDTH - tw2)//2, ty + 80), t2, fill=(136, 153, 187, 255), font=font_body)
    
    return im

def render_scene_3(frame_idx, particles):
    """Scene 3: Features Grid (Four slide-up and fade-in panels)"""
    im = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    draw = ImageDraw.Draw(im)
    
    draw_gradient_background(draw, (5, 10, 20), (2, 4, 8))
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, particles)
    
    # Header
    t_head = "What Code Rakshak Detects"
    tw = draw.textlength(t_head, font=font_header)
    draw.text(((WIDTH - tw)//2, 60), t_head, fill=(255, 255, 255, 255), font=font_header)
    # Gold underline
    draw.line([(WIDTH//2 - 150, 130), (WIDTH//2 + 150, 130)], fill=(245, 166, 35, 255), width=3)
    
    # 4 Feature Cards Config
    cards = [
        {"icon": "🔐", "title": "Security Audit", "desc": "SQL Injection, XSS,\nSecrets exposure,\nOWASP Top 10 vulnerabilities.", "border": (255, 50, 50)},
        {"icon": "🔬", "title": "Static Analysis", "desc": "Dead code, anti-patterns,\nhigh complexity, code smell,\npoor program structure.", "border": (50, 150, 255)},
        {"icon": "⚖️", "title": "Code Quality", "desc": "DRY violations, documentation,\nnaming conventions, style guide\nconformity.", "border": (50, 220, 100)},
        {"icon": "🕵️", "title": "Loophole Hunt", "desc": "Race conditions, edge cases,\nconcurrency issues, logical\nbugs, memory leaks.", "border": (180, 50, 255)}
    ]
    
    card_w = 260
    card_h = 320
    gap = 30
    total_grid_w = (card_w * 4) + (gap * 3)
    start_x = (WIDTH - total_grid_w) // 2
    y_target = 200
    
    for i, card in enumerate(cards):
        # Calculate fade in and slide up based on frame index
        # 15 frames delay per card
        delay = i * 15
        progress = (frame_idx - delay) / 20.0
        progress = max(0.0, min(1.0, progress))
        
        # Easing function (ease out cubic)
        ease = 1.0 - math.pow(1.0 - progress, 3.0)
        
        # Interpolated position and alpha
        y_pos = y_target + (80 * (1.0 - ease))
        alpha = int(ease * 255)
        
        # Card Background
        card_x = start_x + i * (card_w + gap)
        bg_color = (20, 25, 45, int(ease * 200))
        border_col = (card['border'][0], card['border'][1], card['border'][2], alpha)
        
        draw.rounded_rectangle([card_x, y_pos, card_x + card_w, y_pos + card_h], 
                               radius=16, fill=bg_color, outline=border_col, width=2)
        
        # Card Content (drawn with transparency)
        if alpha > 0:
            # Icon
            draw.text((card_x + 110, y_pos + 30), card['icon'], fill=(255, 255, 255, alpha), font=get_font("seguiemj", 36))
            
            # Title
            t_w = draw.textlength(card['title'], font=font_mono)
            draw.text((card_x + (card_w - t_w)//2, y_pos + 90), card['title'], fill=(245, 166, 35, alpha), font=font_mono)
            
            # Description (multi-line drawing)
            desc_lines = card['desc'].split('\n')
            for line_idx, line in enumerate(desc_lines):
                line_w = draw.textlength(line, font=font_small)
                draw.text((card_x + (card_w - line_w)//2, y_pos + 150 + line_idx * 22), 
                          line, fill=(170, 187, 221, alpha), font=font_small)
                
    return im

def render_scene_4(frame_idx, particles):
    """Scene 4: Code Quality Scores (Concentric ring count-ups)"""
    im = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    draw = ImageDraw.Draw(im)
    
    draw_gradient_background(draw, (10, 15, 30), (2, 4, 8))
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, particles)
    
    # Title
    t_head = "YOUR CODE GETS A COMPREHENSIVE SCORE"
    tw = draw.textlength(t_head, font=font_body)
    draw.text(((WIDTH - tw)//2, 60), t_head, fill=(136, 153, 187, 255), font=font_body)
    
    # Rings config: (Center X, Y), target score, label, color, name
    rings = [
        {"cx": 320, "cy": 340, "target": 87, "color": (59, 130, 246), "label": "🔒 Strength", "is_grade": False},
        {"cx": 640, "cy": 340, "target": 91, "color": (34, 197, 94), "label": "⚖️ Fairness", "is_grade": False},
        {"cx": 960, "cy": 340, "target": 89, "color": (245, 166, 35), "label": "🏆 Composite Grade", "is_grade": True}
    ]
    
    r_radius = 90
    for r in rings:
        # Draw background ring (dim outline)
        cx, cy = r['cx'], r['cy']
        draw.ellipse([(cx - r_radius, cy - r_radius), (cx + r_radius, cy + r_radius)], 
                     outline=(255, 255, 255, 20), width=12)
        
        # Calculate animation step (first 90 frames of scene)
        anim_progress = min(1.0, frame_idx / 90.0)
        # Easing
        ease_p = 1.0 - math.pow(1.0 - anim_progress, 2.5)
        
        # Arc mapping
        angle_start = -90
        # If it's a score ring
        if not r['is_grade']:
            curr_score = int(ease_p * r['target'])
            angle_extent = (curr_score / 100.0) * 360
            
            # Draw arc
            # Draw thicker arc segment for rating
            draw.arc([(cx - r_radius, cy - r_radius), (cx + r_radius, cy + r_radius)], 
                     start=angle_start, end=angle_start + angle_extent, 
                     fill=r['color'], width=12)
            
            # Draw score text
            t_score = f"{curr_score}"
            t_w = draw.textlength(t_score, font=font_header)
            draw.text((cx - t_w//2, cy - 36), t_score, fill=(255, 255, 255, 255), font=font_header)
            
            t_max = "/ 100"
            t_mw = draw.textlength(t_max, font=font_small)
            draw.text((cx - t_mw//2, cy + 16), t_max, fill=(85, 85, 102, 255), font=font_small)
        else:
            # Composite Grade
            angle_extent = ease_p * 320  # animate ring shape
            draw.arc([(cx - r_radius, cy - r_radius), (cx + r_radius, cy + r_radius)], 
                     start=angle_start, end=angle_start + angle_extent, 
                     fill=r['color'], width=12)
            
            # Show "A" when animation completes
            grade_val = "A" if anim_progress > 0.8 else "-"
            t_w = draw.textlength(grade_val, font=font_huge)
            draw.text((cx - t_w//2, cy - 56), grade_val, fill=r['color'], font=font_huge)
            
        # Draw label underneath
        lbl_w = draw.textlength(r['label'], font=font_mono)
        draw.text((cx - lbl_w//2, cy + 130), r['label'], fill=(136, 153, 187, 255), font=font_mono)
        
    return im

def render_scene_5(frame_idx, particles):
    """Scene 5: Final CTA (Logo, details, badge, Github URL)"""
    im = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    draw = ImageDraw.Draw(im)
    
    draw_gradient_background(draw, (13, 27, 62), (0, 0, 0))
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, particles)
    
    # Shield logo bouncing gently
    cx = WIDTH // 2
    bounce_y = 150 + int(15 * math.sin(frame_idx * 0.1))
    draw_shield(draw, cx, bounce_y, scale=1.0)
    
    # CODE RAKSHAK Header
    t_head = "CODE RAKSHAK"
    tw = draw.textlength(t_head, font=font_title)
    # Drop shadow
    draw.text((cx - tw//2 + 3, bounce_y + 93), t_head, fill=(0, 0, 0, 255), font=font_title)
    draw.text((cx - tw//2, bounce_y + 90), t_head, fill=(245, 166, 35, 255), font=font_title)
    
    # Description
    t_desc = "AI-powered  ·  Plain English Explanations  ·  Free & Open Source"
    tw_desc = draw.textlength(t_desc, font=font_body)
    draw.text((cx - tw_desc//2, bounce_y + 175), t_desc, fill=(170, 187, 221, 255), font=font_body)
    
    # GitHub box
    git_url = "github.com/arunkumarmeda27/code-rakshak"
    git_w = draw.textlength(git_url, font=font_mono)
    box_w = git_w + 60
    bx1 = cx - box_w // 2
    by1 = bounce_y + 230
    draw.rounded_rectangle([bx1, by1, bx1 + box_w, by1 + 54], radius=8, 
                           fill=(13, 27, 62, 200), outline=(56, 189, 248, 120), width=1)
    # Draw URL
    draw.text((bx1 + 30, by1 + 14), git_url, fill=(56, 189, 248, 255), font=font_mono)
    
    # Powered by text with Google colors
    p1 = "Powered by "
    p2 = "Google"
    p3 = " Gemini AI"
    w1 = draw.textlength(p1, font=font_mono)
    w2 = draw.textlength(p2, font=font_mono)
    w3 = draw.textlength(p3, font=font_mono)
    
    start_px = cx - (w1 + w2 + w3) // 2
    p_y = bounce_y + 310
    
    draw.text((start_px, p_y), p1, fill=(85, 85, 102, 255), font=font_mono)
    
    # Draw Google in color: G(Blue) o(Red) o(Yellow) g(Blue) l(Green) e(Red)
    google_colors = [
        (66, 133, 244),  # Blue
        (234, 67, 53),   # Red
        (251, 188, 5),   # Yellow
        (66, 133, 244),  # Blue
        (52, 168, 83),   # Green
        (234, 67, 53)    # Red
    ]
    g_offset = start_px + w1
    for char_idx, char in enumerate(p2):
        ch_color = google_colors[char_idx]
        draw.text((g_offset, p_y), char, fill=ch_color, font=font_mono)
        g_offset += draw.textlength(char, font=font_mono)
        
    draw.text((g_offset, p_y), p3, fill=(255, 255, 255, 255), font=font_mono)
    
    # Pill Badges
    badges = [
        {"text": "✓ Open Source", "col": (34, 197, 94, 40), "txt_col": (34, 197, 94, 255)},
        {"text": "✓ Free to Use", "col": (245, 166, 35, 40), "txt_col": (245, 166, 35, 255)},
        {"text": "✓ Gemini AI", "col": (99, 102, 241, 40), "txt_col": (129, 140, 248, 255)}
    ]
    
    badge_w = 140
    badge_h = 32
    b_gap = 16
    total_b_w = (badge_w * 3) + (b_gap * 2)
    b_start_x = cx - total_b_w // 2
    b_y = bounce_y + 360
    
    for idx, badge in enumerate(badges):
        bx = b_start_x + idx * (badge_w + b_gap)
        draw.rounded_rectangle([bx, b_y, bx + badge_w, b_y + badge_h], radius=16, 
                               fill=badge['col'], outline=badge['txt_col'], width=1)
        txt_w = draw.textlength(badge['text'], font=font_small)
        draw.text((bx + (badge_w - txt_w)//2, b_y + 6), badge['text'], fill=badge['txt_col'], font=font_small)
        
    return im

# --- MAIN GENERATION ---

def main():
    # Setup video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')  # standard mp4 codec
    video = cv2.VideoWriter(OUT_FILE, fourcc, FPS, (WIDTH, HEIGHT))
    
    if not video.isOpened():
        print("Error: Could not open VideoWriter. Try using another codec (e.g. 'MJPG').")
        return
        
    print(f"Creating cyber video advertisement at {WIDTH}x{HEIGHT}, {FPS} FPS...")
    
    # Initialize background states
    particles = init_particles()
    code_rain = init_code_rain()
    
    # Frame boundaries
    # Total duration: 24s.
    # Scene 1: 0.0s - 3.5s (Frames 0 - 105)
    # Scene 2: 3.5s - 7.5s (Frames 105 - 225)
    # Scene 3: 7.5s - 12.5s (Frames 225 - 375)
    # Scene 4: 12.5s - 18.0s (Frames 375 - 540)
    # Scene 5: 18.0s - 24.0s (Frames 540 - 720)
    
    scene_ranges = [
        (0, 105),    # Scene 1
        (105, 225),  # Scene 2
        (225, 375),  # Scene 3
        (375, 540),  # Scene 4
        (540, 720)   # Scene 5
    ]
    
    total_frames = 720
    fade_len = 15  # 0.5s fade cross-dissolve between scenes
    
    # Buffer frames
    frame_list = []
    
    # Render all individual scenes' base frames
    print("Rendering base scene frames...")
    for f in range(total_frames):
        # Determine current scene
        scene_idx = 0
        for idx, (start, end) in enumerate(scene_ranges):
            if start <= f < end:
                scene_idx = idx
                break
                
        # Offset frame number for scene local calculations
        scene_frame = f - scene_ranges[scene_idx][0]
        
        # Render the specific scene
        if scene_idx == 0:
            frame_img = render_scene_1(scene_frame, code_rain)
        elif scene_idx == 1:
            frame_img = render_scene_2(scene_frame, particles)
        elif scene_idx == 2:
            frame_img = render_scene_3(scene_frame, particles)
        elif scene_idx == 3:
            frame_img = render_scene_4(scene_frame, particles)
        else:
            frame_img = render_scene_5(scene_frame, particles)
            
        frame_list.append((scene_idx, frame_img))
        
        # Show progress occasionally
        if f % 100 == 0:
            print(f"  Rendered {f}/{total_frames} frames...")
            
    # Apply cross-dissolves and write to video
    print("Applying transitions and compilation...")
    for f in range(total_frames):
        # Determine transition if any
        # Cross dissolve occurs around boundaries: e.g. at frame 105, we blend Scene 1 and Scene 2
        # Let's say we dissolve over range [boundary - fade_len, boundary] or [boundary, boundary + fade_len]
        # Let's blend from boundary - fade_len//2 to boundary + fade_len//2
        
        blend_img = None
        current_scene_idx, current_img = frame_list[f]
        
        # Check boundary intersections
        # Boundaries are at 105, 225, 375, 540
        boundaries = [105, 225, 375, 540]
        is_transition = False
        
        for b in boundaries:
            if b - fade_len // 2 <= f < b + fade_len // 2:
                # We are in transition!
                is_transition = True
                # Left scene (outgoing) and Right scene (incoming)
                left_f = b - fade_len // 2 - 1
                right_f = b + fade_len // 2
                
                # Interpolation factor (0.0 to 1.0)
                factor = (f - (b - fade_len // 2)) / float(fade_len)
                factor = max(0.0, min(1.0, factor))
                
                left_img = frame_list[left_f][1]
                right_img = frame_list[right_f][1]
                
                # Perform PIL blend
                blend_img = Image.blend(left_img, right_img, factor)
                break
                
        if not is_transition:
            blend_img = current_img
            
        # Convert PIL Image (RGBA) to OpenCV format (BGR)
        rgb_img = blend_img.convert("RGB")
        numpy_img = np.array(rgb_img)
        bgr_img = cv2.cvtColor(numpy_img, cv2.COLOR_RGB2BGR)
        
        # Write frame to video
        video.write(bgr_img)
        
    # Release video writer
    video.release()
    print(f"Success! Video written to '{OUT_FILE}'")

if __name__ == "__main__":
    main()
