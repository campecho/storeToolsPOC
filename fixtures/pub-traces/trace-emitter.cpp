// Drives librevenge's RVNGRawDrawingGenerator (the exact generator pub2raw
// wraps around libmspub) with a synthetic "demo flyer" callback sequence,
// using the property vocabulary extracted from libmspub-0.1.so.1 strings.
// Output = a byte-exact-format golden trace for the POC's trace parser.
//
// The flyer is a neighborhood coffee shop's grand-opening handout, laid out
// the way a real Publisher user would: banner + headline, an emblem picture
// beside the body copy, a coupon box with a tilted "free pastry" sticker, a
// footer with the address, and a "NOW OPEN" starburst — page 2 is the back
// (the opening-week schedule). Every construct the parser/mapper pin stays
// exercised: both spacing forms, librevenge:rotate with its bogus unit,
// nested vectors (polygon points, bezier path), a base64 binary payload via
// drawGraphicObject AND a bitmap fill on a rectangle (the corpus's dominant
// image path), rounded corners, a 2-point polyline, mixed-style runs,
// insertLineBreak, and hanging-indent bullet paragraphs.
//
// Usage: ./trace-emitter fixtures/pub-traces/demo-flyer-art.png > demo-flyer.trace
#include <librevenge-generators/librevenge-generators.h>
#include <librevenge/librevenge.h>

#include <cmath>
#include <cstdio>
#include <vector>

using namespace librevenge;

static const char *INK = "#3b2314";    // espresso
static const char *CREAM = "#f6efe3";  // paper
static const char *ACCENT = "#e07a1f"; // orange
static const char *YELLOW = "#ffd34d"; // sticker
static const char *WHITE = "#ffffff";

static void styleFill(RVNGRawDrawingGenerator &g, const char *color)
{
	RVNGPropertyList s;
	s.insert("draw:fill", "solid");
	s.insert("draw:fill-color", color);
	s.insert("draw:stroke", "none");
	g.setStyle(s);
}

static void styleStroke(RVNGRawDrawingGenerator &g, const char *color, double widthIn)
{
	RVNGPropertyList s;
	s.insert("draw:fill", "none");
	s.insert("draw:stroke", "solid");
	s.insert("svg:stroke-color", color);
	s.insert("svg:stroke-width", widthIn, RVNG_INCH);
	g.setStyle(s);
}

static void styleFillStroke(RVNGRawDrawingGenerator &g, const char *fill, const char *stroke, double widthIn)
{
	RVNGPropertyList s;
	s.insert("draw:fill", "solid");
	s.insert("draw:fill-color", fill);
	s.insert("draw:stroke", "solid");
	s.insert("svg:stroke-color", stroke);
	s.insert("svg:stroke-width", widthIn, RVNG_INCH);
	g.setStyle(s);
}

static void styleNone(RVNGRawDrawingGenerator &g)
{
	RVNGPropertyList s;
	s.insert("draw:fill", "none");
	s.insert("draw:stroke", "none");
	g.setStyle(s);
}

// Text-frame styling the way Publisher emits it: vertical alignment + the
// 0.04 in default insets on the setStyle preceding startTextObject.
static void styleTextFrame(RVNGRawDrawingGenerator &g, const char *valign)
{
	RVNGPropertyList s;
	s.insert("draw:fill", "none");
	s.insert("draw:stroke", "none");
	s.insert("draw:textarea-vertical-align", valign);
	s.insert("fo:padding-left", 0.04, RVNG_INCH);
	s.insert("fo:padding-right", 0.04, RVNG_INCH);
	s.insert("fo:padding-top", 0.04, RVNG_INCH);
	s.insert("fo:padding-bottom", 0.04, RVNG_INCH);
	g.setStyle(s);
}

static RVNGPropertyList box(double x, double y, double w, double h)
{
	RVNGPropertyList p;
	p.insert("svg:x", x, RVNG_INCH);
	p.insert("svg:y", y, RVNG_INCH);
	p.insert("svg:width", w, RVNG_INCH);
	p.insert("svg:height", h, RVNG_INCH);
	return p;
}

static RVNGPropertyList para(const char *align, bool publisherSingle = true)
{
	RVNGPropertyList p;
	p.insert("fo:text-align", align);
	if (publisherSingle)
		p.insert("fo:line-height", 1.19, RVNG_PERCENT);
	return p;
}

static RVNGPropertyList span(const char *font, double pt, const char *color = 0, bool bold = false, bool italic = false)
{
	RVNGPropertyList s;
	s.insert("style:font-name", font);
	s.insert("fo:font-size", pt, RVNG_POINT);
	if (bold)
		s.insert("fo:font-weight", "bold");
	if (italic)
		s.insert("fo:font-style", "italic");
	if (color)
		s.insert("fo:color", color);
	return s;
}

static void run(RVNGRawDrawingGenerator &g, const RVNGPropertyList &s, const char *text)
{
	g.openSpan(s);
	g.insertText(RVNGString(text));
	g.closeSpan();
}

static void line(RVNGRawDrawingGenerator &g, const RVNGPropertyList &p, const RVNGPropertyList &s, const char *text)
{
	g.openParagraph(p);
	run(g, s, text);
	g.closeParagraph();
}

// A hanging-indent bullet paragraph (fo:margin-left + negative fo:text-indent).
static void bullet(RVNGRawDrawingGenerator &g, const RVNGPropertyList &s, const char *text)
{
	RVNGPropertyList p = para("left");
	p.insert("fo:margin-left", 0.22, RVNG_INCH);
	p.insert("fo:text-indent", -0.16, RVNG_INCH);
	g.openParagraph(p);
	run(g, s, "•  ");
	run(g, s, text);
	g.closeParagraph();
}

static bool readFile(const char *path, std::vector<unsigned char> &bytes)
{
	FILE *f = std::fopen(path, "rb");
	if (!f)
		return false;
	unsigned char buf[4096];
	size_t n;
	while ((n = std::fread(buf, 1, sizeof buf, f)) > 0)
		bytes.insert(bytes.end(), buf, buf + n);
	std::fclose(f);
	return !bytes.empty();
}

int main(int argc, char **argv)
{
	std::vector<unsigned char> art;
	if (argc < 2 || !readFile(argv[1], art))
	{
		std::fprintf(stderr, "usage: %s <emblem.png>\n", argv[0]);
		return 1;
	}
	RVNGBinaryData artBytes(art.data(), (unsigned long)art.size());

	RVNGRawDrawingGenerator g(false);

	RVNGPropertyList docProps;
	g.startDocument(docProps);

	// ---- Page 1: the front of the flyer (8.5 x 11 in, 0.5 in margins) ----
	RVNGPropertyList page;
	page.insert("svg:width", 8.5, RVNG_INCH);
	page.insert("svg:height", 11.0, RVNG_INCH);
	g.startPage(page);

	// [1] Banner across the top
	styleFill(g, INK);
	g.drawRectangle(box(0.5, 0.5, 7.5, 1.75));

	// [2] A thin swoosh under the headline (bezier path: M, C, Z)
	styleFill(g, ACCENT);
	{
		RVNGPropertyList path;
		RVNGPropertyListVector segs;
		RVNGPropertyList m;
		m.insert("librevenge:path-action", "M");
		m.insert("svg:x", 1.75, RVNG_INCH);
		m.insert("svg:y", 1.5, RVNG_INCH);
		segs.append(m);
		RVNGPropertyList c;
		c.insert("librevenge:path-action", "C");
		c.insert("svg:x1", 3.25, RVNG_INCH);
		c.insert("svg:y1", 1.3, RVNG_INCH);
		c.insert("svg:x2", 5.75, RVNG_INCH);
		c.insert("svg:y2", 1.3, RVNG_INCH);
		c.insert("svg:x", 7.25, RVNG_INCH);
		c.insert("svg:y", 1.5, RVNG_INCH);
		segs.append(c);
		RVNGPropertyList z;
		z.insert("librevenge:path-action", "Z");
		segs.append(z);
		path.insert("svg:d", segs);
		g.drawPath(path);
	}

	// [3] Headline
	styleTextFrame(g, "middle");
	g.startTextObject(box(0.75, 0.55, 7.0, 0.9));
	{
		RVNGPropertyList p = para("center");
		RVNGPropertyList s = span("Impact", 54.0, WHITE);
		s.insert("fo:font-weight", "normal");
		line(g, p, s, "GRAND OPENING");
	}
	g.endTextObject();

	// [4] Banner subline — shop name + date, two runs
	styleTextFrame(g, "middle");
	g.startTextObject(box(0.75, 1.55, 7.0, 0.6));
	g.openParagraph(para("center"));
	run(g, span("Arial", 15.0, YELLOW, true), "Harbor Street Coffee Co.");
	run(g, span("Arial", 15.0, WHITE), "  ·  Saturday, September 19  ·  7 AM – 7 PM");
	g.closeParagraph();
	g.endTextObject();

	// [5] The emblem, the way real Publisher files carry pictures: a bitmap
	// fill on the following rectangle.
	{
		RVNGPropertyList s;
		s.insert("draw:fill", "bitmap");
		s.insert("draw:fill-image", artBytes);
		s.insert("draw:fill-image-ref-point", "top-left");
		s.insert("draw:stroke", "none");
		s.insert("librevenge:mime-type", "image/png");
		s.insert("style:repeat", "stretch");
		g.setStyle(s);
	}
	g.drawRectangle(box(0.5, 2.5, 3.4, 3.4));

	// [6] Body copy beside the emblem: a mixed-style lead paragraph, then a
	// bulleted list, then a bold closer.
	styleNone(g);
	g.startTextObject(box(4.15, 2.5, 3.85, 3.4));
	{
		RVNGPropertyList p = para("left");
		g.openParagraph(p);
		run(g, span("Times New Roman", 14.0), "Join us Saturday for our ");
		run(g, span("Times New Roman", 14.0, 0, true), "grand opening celebration");
		run(g, span("Times New Roman", 14.0), " — free coffee, door prizes and live music all day long.");
		g.closeParagraph();

		RVNGPropertyList b = span("Arial", 12.0, INK);
		bullet(g, b, "Free small coffee for the first 100 guests");
		bullet(g, b, "Ribbon cutting at 8 AM with Mayor Ortiz");
		bullet(g, b, "Live music on the patio from noon");
		bullet(g, b, "Door prizes drawn every hour");

		line(g, p, span("Times New Roman", 14.0, 0, true), "Doors open at 7 AM.");
		line(g, p, span("Times New Roman", 14.0, ACCENT, false, true), "Locally roasted. Poured with care.");
	}
	g.endTextObject();

	// [7] Coupon box (rounded corners → svg:rx)
	styleFillStroke(g, CREAM, INK, 0.02);
	{
		RVNGPropertyList coupon = box(0.75, 6.25, 7.0, 1.9);
		coupon.insert("svg:rx", 0.12, RVNG_INCH);
		g.drawRectangle(coupon);
	}

	// [8] Coupon copy
	styleTextFrame(g, "middle");
	g.startTextObject(box(1.0, 6.35, 4.4, 1.7));
	line(g, para("left"), span("Arial", 11.0, INK, true), "BRING THIS FLYER AND GET");
	line(g, para("left"), span("Impact", 44.0, ACCENT), "20% OFF");
	line(g, para("left"), span("Arial", 10.0, INK), "your first order  ·  one per customer  ·  valid through October 31");
	g.endTextObject();

	// [9] Tilted sticker (Publisher rotation via librevenge:rotate) …
	styleFill(g, YELLOW);
	{
		RVNGPropertyList sticker = box(5.85, 6.15, 1.9, 1.9);
		sticker.insert("librevenge:rotate", 15.0);
		g.drawRectangle(sticker);
	}
	// [10] … with its text frame rotated to match
	styleTextFrame(g, "middle");
	{
		RVNGPropertyList t = box(5.85, 6.15, 1.9, 1.9);
		t.insert("librevenge:rotate", 15.0);
		g.startTextObject(t);
	}
	line(g, para("center"), span("Impact", 26.0, INK), "FREE");
	line(g, para("center"), span("Arial", 12.0, INK, true), "PASTRY");
	line(g, para("center"), span("Arial", 9.0, INK), "with any drink");
	g.endTextObject();

	// [11] Footer divider as a two-point polyline
	styleStroke(g, INK, 0.01);
	{
		RVNGPropertyList divider;
		RVNGPropertyListVector pts;
		RVNGPropertyList p1, p2;
		p1.insert("svg:x", 0.75, RVNG_INCH);
		p1.insert("svg:y", 8.5, RVNG_INCH);
		p2.insert("svg:x", 7.75, RVNG_INCH);
		p2.insert("svg:y", 8.5, RVNG_INCH);
		pts.append(p1);
		pts.append(p2);
		divider.insert("svg:points", pts);
		g.drawPolyline(divider);
	}

	// [12] Footer: name, address, phone + hours
	styleNone(g);
	g.startTextObject(box(0.75, 8.65, 5.2, 1.1));
	line(g, para("left"), span("Arial", 14.0, INK, true), "Harbor Street Coffee Co.");
	line(g, para("left"), span("Arial", 12.0, INK), "412 Harbor Street  ·  Anytown, USA 01234");
	line(g, para("left"), span("Arial", 12.0, INK), "(555) 010-2468  ·  open daily 7 AM – 7 PM");
	g.endTextObject();

	// [13] "NOW OPEN" starburst: a 10-vertex star polygon …
	styleFill(g, ACCENT);
	{
		RVNGPropertyList poly;
		RVNGPropertyListVector ppts;
		const double cx = 6.95, cy = 9.65, outer = 0.95, inner = 0.42;
		for (int i = 0; i < 10; ++i)
		{
			const double r = (i % 2 == 0) ? outer : inner;
			const double a = -M_PI / 2 + i * (M_PI / 5);
			RVNGPropertyList pp;
			pp.insert("svg:x", std::round((cx + r * std::cos(a)) * 1e4) / 1e4, RVNG_INCH);
			pp.insert("svg:y", std::round((cy + r * std::sin(a)) * 1e4) / 1e4, RVNG_INCH);
			ppts.append(pp);
		}
		poly.insert("svg:points", ppts);
		g.drawPolygon(poly);
	}
	// [14] … with its label tilted the other way
	styleTextFrame(g, "middle");
	{
		RVNGPropertyList t = box(6.2, 9.2, 1.5, 0.9);
		t.insert("librevenge:rotate", -12.0);
		g.startTextObject(t);
	}
	line(g, para("center"), span("Impact", 17.0, WHITE), "NOW");
	line(g, para("center"), span("Impact", 17.0, WHITE), "OPEN");
	g.endTextObject();

	g.endPage();

	// ---- Page 2: the back — opening-week schedule ----
	g.startPage(page);

	// [1] Cream backer
	styleFill(g, CREAM);
	g.drawRectangle(box(0.5, 0.5, 7.5, 10.0));

	// [2] Top band + [3] its title
	styleFill(g, INK);
	g.drawRectangle(box(0.5, 0.5, 7.5, 1.1));
	styleTextFrame(g, "middle");
	g.startTextObject(box(0.75, 0.55, 7.0, 1.0));
	line(g, para("center"), span("Impact", 30.0, WHITE), "GRAND OPENING WEEK");
	g.endTextObject();

	// [4] Schedule
	styleNone(g);
	g.startTextObject(box(0.9, 1.9, 6.7, 4.1));
	{
		RVNGPropertyList day = span("Arial", 14.0, ACCENT, true);
		RVNGPropertyList item = span("Arial", 12.0, INK);
		RVNGPropertyList left = para("left");
		line(g, left, day, "Saturday, September 19");
		line(g, left, item, "7 AM   Doors open — free small coffee for the first 100 guests");
		line(g, left, item, "8 AM   Ribbon cutting with Mayor Ortiz");
		line(g, left, item, "Noon   Live music on the patio");
		line(g, left, item, "All day   Door prizes drawn every hour");
		line(g, left, span("Arial", 11.0, INK), " ");
		line(g, left, day, "Sunday, September 20");
		line(g, left, item, "9 AM   Latte-art demo with our head barista");
		line(g, left, item, "2 PM   Kids' cocoa hour");
		line(g, left, span("Arial", 11.0, INK), " ");
		line(g, left, day, "All week");
		line(g, left, item, "Bring the coupon on the front for 20% off your first order.");
	}
	g.endTextObject();

	// [5] The emblem again, this time as a direct graphic-object embed (the
	// other way images reach the trace; same bytes → the mapper dedupes it).
	styleNone(g);
	{
		RVNGPropertyList img = box(3.0, 6.3, 2.5, 2.5);
		img.insert("librevenge:mime-type", "image/png");
		img.insert("office:binary-data", artBytes);
		g.drawGraphicObject(img);
	}

	// [6] Address block (soft line break inside one paragraph)
	styleNone(g);
	g.startTextObject(box(2.0, 9.0, 4.5, 0.8));
	{
		RVNGPropertyList p = para("center", false);
		RVNGPropertyList s = span("Arial", 10.0, INK);
		g.openParagraph(p);
		run(g, s, "412 Harbor Street");
		g.insertLineBreak();
		run(g, s, "Anytown, USA 01234");
		g.closeParagraph();
	}
	g.endTextObject();

	// [7] Web + social line
	styleNone(g);
	g.startTextObject(box(0.75, 9.95, 7.0, 0.4));
	line(g, para("center"), span("Arial", 9.0, ACCENT, true), "harborstreetcoffee.example  ·  @harborstreetcoffee");
	g.endTextObject();

	g.endPage();

	g.endDocument();
	return 0;
}
