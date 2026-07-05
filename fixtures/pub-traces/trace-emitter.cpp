// Drives librevenge's RVNGRawDrawingGenerator (the exact generator pub2raw
// wraps around libmspub) with a synthetic "demo flyer" callback sequence,
// using the property vocabulary extracted from libmspub-0.1.so.1 strings.
// Output = a byte-exact-format golden trace for the POC's trace parser.
#include <librevenge-generators/librevenge-generators.h>
#include <librevenge/librevenge.h>

using namespace librevenge;

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

int main()
{
	RVNGRawDrawingGenerator g(false);

	RVNGPropertyList docProps;
	g.startDocument(docProps);

	// ---- Page 1: 8.5 x 11 in flyer ----
	RVNGPropertyList page;
	page.insert("svg:width", 8.5, RVNG_INCH);
	page.insert("svg:height", 11.0, RVNG_INCH);
	g.startPage(page);

	// Banner rectangle across the top
	styleFill(g, "#cc0000");
	RVNGPropertyList banner;
	banner.insert("svg:x", 0.5, RVNG_INCH);
	banner.insert("svg:y", 0.5, RVNG_INCH);
	banner.insert("svg:width", 7.5, RVNG_INCH);
	banner.insert("svg:height", 1.75, RVNG_INCH);
	g.drawRectangle(banner);

	// Headline text frame over the banner
	{
		RVNGPropertyList s;
		s.insert("draw:fill", "none");
		s.insert("draw:stroke", "none");
		s.insert("draw:textarea-vertical-align", "middle");
		s.insert("fo:padding-left", 0.04, RVNG_INCH);
		s.insert("fo:padding-right", 0.04, RVNG_INCH);
		s.insert("fo:padding-top", 0.04, RVNG_INCH);
		s.insert("fo:padding-bottom", 0.04, RVNG_INCH);
		g.setStyle(s);
	}
	RVNGPropertyList headline;
	headline.insert("svg:x", 0.75, RVNG_INCH);
	headline.insert("svg:y", 0.75, RVNG_INCH);
	headline.insert("svg:width", 7.0, RVNG_INCH);
	headline.insert("svg:height", 1.25, RVNG_INCH);
	g.startTextObject(headline);
	{
		RVNGPropertyList para;
		para.insert("fo:text-align", "center");
		para.insert("fo:line-height", 1.19, RVNG_PERCENT);
		g.openParagraph(para);
		RVNGPropertyList span;
		span.insert("style:font-name", "Impact");
		span.insert("fo:font-size", 48.0, RVNG_POINT);
		span.insert("fo:font-weight", "normal");
		span.insert("fo:color", "#ffffff");
		g.openSpan(span);
		g.insertText(RVNGString("GRAND OPENING"));
		g.closeSpan();
		g.closeParagraph();
	}
	g.endTextObject();

	// Body text frame with two spans (bold run inside a sentence)
	{
		RVNGPropertyList s;
		s.insert("draw:fill", "none");
		s.insert("draw:stroke", "none");
		g.setStyle(s);
	}
	RVNGPropertyList body;
	body.insert("svg:x", 0.75, RVNG_INCH);
	body.insert("svg:y", 2.6, RVNG_INCH);
	body.insert("svg:width", 4.5, RVNG_INCH);
	body.insert("svg:height", 3.0, RVNG_INCH);
	g.startTextObject(body);
	{
		RVNGPropertyList para;
		para.insert("fo:text-align", "left");
		para.insert("fo:line-height", 1.19, RVNG_PERCENT);
		g.openParagraph(para);
		RVNGPropertyList span;
		span.insert("style:font-name", "Times New Roman");
		span.insert("fo:font-size", 12.0, RVNG_POINT);
		g.openSpan(span);
		g.insertText(RVNGString("Join us Saturday for our "));
		g.closeSpan();
		RVNGPropertyList boldSpan;
		boldSpan.insert("style:font-name", "Times New Roman");
		boldSpan.insert("fo:font-size", 12.0, RVNG_POINT);
		boldSpan.insert("fo:font-weight", "bold");
		g.openSpan(boldSpan);
		g.insertText(RVNGString("grand opening celebration"));
		g.closeSpan();
		RVNGPropertyList tailSpan;
		tailSpan.insert("style:font-name", "Times New Roman");
		tailSpan.insert("fo:font-size", 12.0, RVNG_POINT);
		g.openSpan(tailSpan);
		g.insertText(RVNGString(" with door prizes and demos."));
		g.closeSpan();
		g.closeParagraph();
		g.openParagraph(para);
		g.openSpan(span);
		g.insertText(RVNGString("Doors open at 9 AM."));
		g.closeSpan();
		g.closeParagraph();
	}
	g.endTextObject();

	// A rotated accent rectangle (Publisher rotation via librevenge:rotate)
	styleFill(g, "#ffd700");
	RVNGPropertyList accent;
	accent.insert("svg:x", 5.75, RVNG_INCH);
	accent.insert("svg:y", 3.0, RVNG_INCH);
	accent.insert("svg:width", 2.0, RVNG_INCH);
	accent.insert("svg:height", 2.0, RVNG_INCH);
	accent.insert("librevenge:rotate", 15.0);
	g.drawRectangle(accent);

	// Rounded rectangle (svg:rx present)
	styleStroke(g, "#000000", 0.02);
	RVNGPropertyList rounded;
	rounded.insert("svg:x", 0.75, RVNG_INCH);
	rounded.insert("svg:y", 6.0, RVNG_INCH);
	rounded.insert("svg:width", 7.0, RVNG_INCH);
	rounded.insert("svg:height", 2.0, RVNG_INCH);
	rounded.insert("svg:rx", 0.1, RVNG_INCH);
	g.drawRectangle(rounded);

	// Divider line as a two-point polyline
	{
		RVNGPropertyList s;
		s.insert("draw:fill", "none");
		s.insert("draw:stroke", "solid");
		s.insert("svg:stroke-color", "#333333");
		s.insert("svg:stroke-width", 0.01, RVNG_INCH);
		g.setStyle(s);
	}
	RVNGPropertyList line;
	RVNGPropertyListVector pts;
	RVNGPropertyList p1, p2;
	p1.insert("svg:x", 0.75, RVNG_INCH);
	p1.insert("svg:y", 8.5, RVNG_INCH);
	p2.insert("svg:x", 7.75, RVNG_INCH);
	p2.insert("svg:y", 8.5, RVNG_INCH);
	pts.append(p1);
	pts.append(p2);
	line.insert("svg:points", pts);
	g.drawPolyline(line);

	// A star-ish polygon (maps to bounding-box rect + report note in P1)
	styleFill(g, "#0866d2");
	RVNGPropertyList poly;
	RVNGPropertyListVector ppts;
	double xs[] = {6.0, 6.4, 7.4, 6.6, 7.0, 6.0, 5.0, 5.4, 4.6, 5.6};
	double ys[] = {8.9, 9.6, 9.6, 10.1, 11.0, 10.5, 11.0, 10.1, 9.6, 9.6};
	for (int i = 0; i < 10; ++i)
	{
		RVNGPropertyList pp;
		pp.insert("svg:x", xs[i], RVNG_INCH);
		pp.insert("svg:y", ys[i], RVNG_INCH);
		ppts.append(pp);
	}
	poly.insert("svg:points", ppts);
	g.drawPolygon(poly);

	// A path with bezier segments (svg:d + librevenge:path-action)
	styleFill(g, "#2e8b3d");
	RVNGPropertyList path;
	RVNGPropertyListVector segs;
	{
		RVNGPropertyList m;
		m.insert("librevenge:path-action", "M");
		m.insert("svg:x", 1.0, RVNG_INCH);
		m.insert("svg:y", 9.0, RVNG_INCH);
		segs.append(m);
		RVNGPropertyList c;
		c.insert("librevenge:path-action", "C");
		c.insert("svg:x1", 1.5, RVNG_INCH);
		c.insert("svg:y1", 8.5, RVNG_INCH);
		c.insert("svg:x2", 2.5, RVNG_INCH);
		c.insert("svg:y2", 9.5, RVNG_INCH);
		c.insert("svg:x", 3.0, RVNG_INCH);
		c.insert("svg:y", 9.0, RVNG_INCH);
		segs.append(c);
		RVNGPropertyList z;
		z.insert("librevenge:path-action", "Z");
		segs.append(z);
	}
	path.insert("svg:d", segs);
	g.drawPath(path);

	// An embedded image placeholder (tiny PNG bytes) — P1 maps to a flagged
	// picture frame; P3 extracts. Included so the parser handles binary props.
	{
		RVNGPropertyList s;
		s.insert("draw:fill", "none");
		s.insert("draw:stroke", "none");
		g.setStyle(s);
	}
	RVNGPropertyList img;
	img.insert("svg:x", 5.5, RVNG_INCH);
	img.insert("svg:y", 2.6, RVNG_INCH);
	img.insert("svg:width", 2.25, RVNG_INCH);
	img.insert("svg:height", 1.5, RVNG_INCH);
	img.insert("librevenge:mime-type", "image/png");
	const unsigned char pngBytes[] = {0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
	RVNGBinaryData bin(pngBytes, sizeof(pngBytes));
	img.insert("office:binary-data", bin);
	g.drawGraphicObject(img);

	g.endPage();

	// ---- Page 2: different content, tests multi-page ----
	g.startPage(page);
	styleFill(g, "#e4e4e4");
	RVNGPropertyList back;
	back.insert("svg:x", 0.5, RVNG_INCH);
	back.insert("svg:y", 0.5, RVNG_INCH);
	back.insert("svg:width", 7.5, RVNG_INCH);
	back.insert("svg:height", 10.0, RVNG_INCH);
	g.drawRectangle(back);
	{
		RVNGPropertyList s;
		s.insert("draw:fill", "none");
		s.insert("draw:stroke", "none");
		g.setStyle(s);
	}
	RVNGPropertyList addr;
	addr.insert("svg:x", 2.0, RVNG_INCH);
	addr.insert("svg:y", 5.0, RVNG_INCH);
	addr.insert("svg:width", 4.5, RVNG_INCH);
	addr.insert("svg:height", 1.0, RVNG_INCH);
	g.startTextObject(addr);
	{
		RVNGPropertyList para;
		para.insert("fo:text-align", "center");
		g.openParagraph(para);
		RVNGPropertyList span;
		span.insert("style:font-name", "Arial");
		span.insert("fo:font-size", 10.0, RVNG_POINT);
		g.openSpan(span);
		g.insertText(RVNGString("123 Main Street"));
		g.closeSpan();
		g.insertLineBreak();
		g.openSpan(span);
		g.insertText(RVNGString("Anytown, USA 01234"));
		g.closeSpan();
		g.closeParagraph();
	}
	g.endTextObject();
	g.endPage();

	g.endDocument();
	return 0;
}
