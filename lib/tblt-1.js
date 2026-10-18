// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2026 Jean-François Moine - LGPL3+
// tblt.js - module to generate tablatures
// tblt.js - module to generate tablatures
//
// Copyright (C) 2026 Jean-François Moine
//
// This file is part of abc2svg.
//
// abc2svg is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with abc2svg.  If not, see <http://www.gnu.org/licenses/>.
//
// This module is loaded when %%tablature appears in a ABC source.
//
// %%tablature [#n] [pitch=p] [[un1] un2] un3 head note [bar]
//	n = tablature number
//	p = instrument pitch
//	un1=width, un2=descent, un3=ascent
//	head, note, bar = PostScript functions called on line start, note and bar
// if from lyrics (no pitch)
//	head(linewidth, x, y, number of lyric lines)
//	note(string, x, y, line_number)
//	bar(ABC_bar, x, y, line_number)
// if instrument pitch
//	head(pitch_string)
//	note(octave, octave_pitch (0..11), x)
//	(no bar)

"use strict"
if (typeof abc2svg == "undefined")
    var	abc2svg = {}

abc2svg.tblt = {

	// get the %%tablature arguments
    do_pscom: function(of, parm) {

	// get the instrument pitch
    function get_pit(t) {
	if (!t)
		return
    var	i = (t[0] == '^' || t[0] == '_') ? 1 : 0,
	p = "C D EF G A Bc d ef g a b".indexOf(t[i++])	// (C = 0)

	while (t[i] == ',' || t[i] == "'")
		p += t[i++] == ',' ? -12 : 12
	return p + ((t[0] == '^' || t[i] == '#') ? 1
			 : (t[0] == '_' || t[i] == 'b') ? -1
			 : 0)
    } // get_pit()

    var	tblt,
	C = abc2svg.C,
	glovar = this.glovar(),
	p_v = this.get_curvoice(),
	a = parm.split(/\s+/, 3)

	if (a.shift() != "tablature")
		return of(parm)
	if (!glovar.tblt_a)
		glovar.tblt_a = {}
	if (a.length == 1) {			// if only the tablature ID
		if (!p_v)
			return		// fixme: error
		tblt = glovar.tblt_a[a[0]]
		if (tblt)
			p_v.tblt = tblt
//		else			//fixme: error
		return
	}

	a = parm.match(
/(#\d)?\s*(pitch=[_^]?[A-Ga-g][,']*[b#]?)?\s+([0-9.]+)\s*([0-9.]*)\s*([0-9.]*)\s*(\w+)\s*(\w+)\s*(\w*)/
	)					// '
	if (!a)
		return this.syntax(1, this.errs.bad_val, "%%tablature")
	tblt = {}

	if (a[1])				// tablature number
		glovar.tblt_a[a[1]] = tblt
	if (a[2]) {
		tblt.i = a[2].slice(6)		// instrument
		tblt.p = get_pit(tblt.i)	// pitch
	}
	if (a[5]) {
		tblt.w = a[3]			// a[3,4,5] = width, descent, ascent
		tblt.d = +a[4]
		tblt.a = +a[5]
	} else if (a[4]) {
		tblt.w = "0"
		tblt.a = +a[3]
		tblt.d = +a[4]
	} else {
		tblt.w = "0"
		tblt.a = 0
		tblt.d = +a[3]
	}
	tblt.h = a[6]				// a[6,7,8] = head, note, bar
	tblt.n = a[7]
	tblt.b = a[8]

	// set the tablature in the voice
	if (p_v)
		p_v.tblt = tblt
    }, // do_pscom()

    // draw a tablature
    draw_tblt: function(of) {
    var	fnt, v, p_v, tblt,
	mus = this,
	C = abc2svg.C,
	glovar = mus.glovar(),
	v_tb = mus.get_voice_tb(),
	img = mus.get_img(),
	y = -glovar.music_h + glovar.tblt_h

	// draw a tablature from lyrics (no pitch)
	function dr_no_pit(p_v, y) {
	    var	j, ly, n, s

		for (s = p_v.sym; s; s = s.next) {
			if (s.a_ly) {
				n = s.a_ly.length	// number of verses
				break
			}
		}
		if (!n)
			return				// fixme: error

		mus.do_begin_end("ps", null,		// draw the head
			img.wx + " " + img.lm + " " + y + " " + n + " " + tblt.h)

		for (j = 0; j < n ;j++) {		// draw the notes and bars
	 		for (s = p_v.sym; s; s = s.next) {
				if (s.bar_type) {
					if (!tblt.b)
						continue
					mus.do_begin_end("ps", null,
						'(' + s.bar_type + ')'
						+ (s.x + img.lm).toFixed(2)
						+ " " + y
						+ " " + j + " " + tblt.b)
				} else if (s.a_ly) {
					ly = s.a_ly[j]
					if (!ly)
						continue
					mus.do_begin_end("ps", null,
						'('
						+ ly.t.replace(/\(|\)/, "\\$1")
						+ ')'
						+ (s.x + img.lm).toFixed(2)
						+ " " + y
						+ " " + j + " " + tblt.n)
				}
			}
		}
	} // dr_no_pit()

	function dr_pit(p_v, y) {
	    var	nt, tie, pit,
		s = p_v.sym

		y = -glovar.music_h
		mus.do_begin_end("ps", null,		// draw the head
			"gsave " + img.lm.toFixed(2) + ' ' + y
			+ " T(" + p_v.tblt.i + ")" + p_v.tblt.h)
		for ( ; s; s = s.next) {
			if (s.type != C.NOTE)
				continue
			if (tie) {
				tie = s.ti1
				continue
			}
			nt = s.notes[0]
			pit = nt.midi - 60 - tblt.p
			mus.do_begin_end("ps", null,
//				((pit / 12) | 0) + " " + (pit % 12)
				((pit / 36) | 0) + " " + (pit % 36)
				+ " " + s.x.toFixed(2) + " " + tblt.n)
			tie = s.ti1
		}
		mus.do_begin_end("ps", null, "grestore")
	} // dr_pit()

	// ---- draw_tblt ----
	of()					// draw all decorations

	fnt = mus.get_font('vocal')
	mus.do_begin_end("ps", null,		// draw the font
		"/" + fnt.name.split(',').slice(-1) + " " + fnt.size + " selectfont")

	v = v_tb.length
	while (--v >= 0) {
		p_v = v_tb[v]
		tblt = p_v.tblt
		if (!tblt)
			continue

		y -= tblt.d + 2
		if (!tblt.i)			// tablature from lyrics
			dr_no_pit(p_v, y)
		else				// tablature with instrument pitch
			dr_pit(p_v, y)
		y -= tblt.a + 2
	}
    }, // draw_sym()

    // keep room for tablatures
    set_glue: function(of, w) {
    var	s, st, v, p_v, p_st, tblt,
	glovar = this.glovar(),
	v_tb = this.get_voice_tb(),
	st_tb = this.get_staff_tb(),
	sw = 0,					// width of first symbols
	tw = 0,					// width of the widest tablature head
	h = 0					// height of all tablatures

	st = st_tb.length - 1			// last staff
//fixme: how to know if this staff is printed?
//	p_st = st_tb[st]

	// get the height of the tablatures and remove the lyrics when no pitch
	v = v_tb.length
	while (--v >= 0) {
		p_v = v_tb[v]
		tblt = p_v.tblt
		if (tblt) {
			h += tblt.a + tblt.d + 4
			if (tblt.w > tw)
				tw = tblt.w
			if (!tblt.i)		// if no instrument pitch, no lyrics
				p_v.have_ly = 0 //false
		}
	}
	glovar.tblt_h = h

	// adjust the clef height of the last staff to get room for the tablatures
	v = v_tb.length
	while (--v >= 0) {
		p_v = v_tb[v]
		if (p_v.st != st)
			continue
		for (s = p_v.sym; s.time == p_v.sym.time; s = s.next)
			if (s.clef_type)
				break
		if (s.clef_type) {
			s.ymn -= h
			break
		}
	}

	// horizontal shift the music to avoid clash with the tablature heads
	for (s = this.get_tsfirst(); s; s = s.ts_next) {
		if (s.shrink)
			sw += s.shrink
		if (s.type == abc2svg.C.NOTE) {
			if (sw < tw) {
				while (!s.shrink)
					s = s.ts_prev
				s.shrink += tw - sw
			}
			break
		}
	}

	of(w)						// set the glue
    }, // set_glue()

    set_hooks: function(abc) {
	abc.do_pscom = abc2svg.tblt.do_pscom.bind(abc, abc.do_pscom)
	abc.draw_all_deco = abc2svg.tblt.draw_tblt.bind(abc, abc.draw_all_deco)
	abc.set_sym_glue = abc2svg.tblt.set_glue.bind(abc, abc.set_sym_glue)
    }
} // tblt

if (!abc2svg.mhooks)
	abc2svg.mhooks = {}
abc2svg.mhooks.tblt = abc2svg.tblt.set_hooks
