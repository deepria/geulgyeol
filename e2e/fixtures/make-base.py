"""Generate our original, tiny test font (requires fontTools, not needed to run tests)."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
fb = FontBuilder(2048, isTTF=True)
order = ['.notdef','space','ga','shared','A','V','f','i','fi','mark']
fb.setupGlyphOrder(order)
fb.setupCharacterMap({32:'space',ord('가'):'ga',ord('나'):'shared',ord('낙'):'shared',65:'A',86:'V',102:'f',105:'i',0xfb01:'fi',0x301:'mark'})
glyphs = {}
for index, name in enumerate(order):
    pen = TTGlyphPen(None)
    if name != 'space':
        pen.moveTo((100,0)); pen.lineTo((100,1400)); pen.qCurveTo((400+index*10,1700),(650+index*10,1400)); pen.lineTo((700+index*10,0)); pen.closePath()
    glyphs[name] = pen.glyph()
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({name:(0 if name=='mark' else 1024 if name in ['space','i'] else 1800,100) for name in order})
fb.setupHorizontalHeader(ascent=1700, descent=-348)
fb.setupNameTable({'familyName':'Geulgyeol Fixture','styleName':'Regular','uniqueFontIdentifier':'GeulgyeolFixtureOriginal','fullName':'Geulgyeol Fixture Regular','psName':'GeulgyeolFixture-Regular','copyright':'Original Geulgyeol test fixture','licenseDescription':'Public domain original test fixture'})
fb.setupOS2(sTypoAscender=1700,sTypoDescender=-348,usWinAscent=1700,usWinDescent=348)
fb.setupPost()
addOpenTypeFeaturesFromString(fb.font, 'feature kern { pos A V -160; } kern; feature liga { sub f i by fi; } liga;')
fb.save(Path(__file__).with_name('base.ttf'))
