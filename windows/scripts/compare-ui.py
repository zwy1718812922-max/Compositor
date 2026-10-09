from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
reference = Image.open(root / 'design/ps-ui-classic.png').convert('RGB')
rendered = Image.open(root / 'preview.png').convert('RGB')
assert reference.size == rendered.size == (1697, 927)
full = Image.new('RGB', (reference.width * 2, reference.height + 26), '#eeeeee')
draw = ImageDraw.Draw(full)
draw.text((12, 7), 'Selected concept', fill='black')
draw.text((reference.width + 12, 7), 'Running Windows app', fill='black')
full.paste(reference, (0, 26)); full.paste(rendered, (reference.width, 26))
full.save(root / 'design/comparison-full.png')
for name, box_a, box_b in [
    ('panels', (1338,84,1697,927), (1343,84,1697,927)),
    ('chrome', (0,0,1697,124), (0,0,1697,124)),
]:
    a, b = reference.crop(box_a), rendered.crop(box_b)
    combined = Image.new('RGB', (max(a.width,b.width), a.height+b.height+52), '#eeeeee')
    draw = ImageDraw.Draw(combined)
    draw.text((8,6), 'Selected concept', fill='black'); combined.paste(a, (0,26))
    draw.text((8,a.height+32), 'Running app', fill='black'); combined.paste(b, (0,a.height+52))
    combined.save(root / f'design/comparison-{name}.png')
