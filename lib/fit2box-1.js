// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2024 Jean-Francois Moine - LGPL3+
// fit2box.js - module for filling a tune in a box
// fit2box.js - module for filling a tune in a box
//
// Copyright (C) 2025 Jean-François Moine
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
// This module is loaded when "%%fit2box" appears in a ABC source.
//
// Parameters
//	%%fit2box width height
//		width is the width of the box.
//			The value '*' (star) is the value of %%pagewidth
//		height is the height of the box.
//			The value '*' (star) is the value od %%pageheight

if (typeof abc2svg == "undefined")
    var	abc2svg = {}

abc2svg.fit2box = {

    // generation function with %%fit2box
    do_fit: function(mus) {
    var	r, sv, v, w, h, hh, sc,
	parse = mus.parse,
	f = parse.file,
	fn = parse.fname,
	cfmt = mus.cfmt(),
	wb = cfmt.fit2box[0],
	hb = cfmt.fit2box[1],
	io = user.img_out,			// save the original img_out
	ob = ""					// output buffer

	user.img_out = function(p) {		// function to get the output file
			ob += p
		}

	// set some parameters
	if (f.indexOf("%%stretchlast") < 0)
		f = "%%stretchlast 0\n" + f
	else
		f = f.replace(/%%stretchlast.*/, "%%stretchlast 0")
	if (f.indexOf("%%stretchstaff") < 0)
		f = "%%stretchstaff 0\n" + f
	else
		f = f.replace(/%%stretchstaff.*/, "%%stretchstaff 0")
	if (f.indexOf("%%rightmargin") < 0)
		f = "%%rightmargin 0\n" + f
	else
		f = f.replace(/%%rightmargin.*/, "%%rightmargin 0")
	if (f.indexOf("%%leftmargin") < 0)
		f = "%%leftmargin 0\n" + f
	else
		f = f.replace(/%%leftmargin.*/, "%%leftmargin 0")
	if (f.indexOf("%%pagewidth") < 0)
		f = "%%pagewidth " + wb + "\n" + f
	else
		f = f.replace(/%%pagewidth.*/, "%%pagewidth " + wb)
	cfmt.trimsvg = 1
	cfmt.fullsvg = "a"

	// do a first generation
	mus.tosvg(fn, f)

	// analyse the result of the generation
	w = h = 0
	r = ob.match(/<svg[^>]*/g)
	if (!r)
		return				// no SVG
	while (1) {
		sv = r.shift()			// next music line
		if (!sv)
			break
		v = sv.match(/viewBox="0 0 (\d+) (\d+)"/)
		if (!hh) {			// the first SVG is the tune header
			hh = +v[2]
			continue
		}
		if (+v[1] > w)
			w = +v[1]		// max width (thanks to trimsvg)
		h += +v[2]			// whole height
	}
	h *= 1.01				// (generation constraints)
	w *= 1.01
//console.log("-- box:"+wb+"x"+hb
//+" w:"+w.toFixed(2)+" h:"+h.toFixed(2)+" hh:"+hh.toFixed(2))

	sc = (hb - hh) / h			// height scale
	v = wb / w				// width scale
//console.log("     scw:"+v.toFixed(2)+" sch:"+sc.toFixed(2))
	if (v < sc)
		sc = v
	if (f.indexOf("%%pagescale ") >= 0)
		f = f.replace(/%%pagescale.*/, "%%pagescale " + sc.toFixed(2))
	else
		f = f.replace(/(K:.*)/, "$1\n%%pagescale " + sc.toFixed(2))

	v = parseInt((wb - w * sc) / 2)		// margins
	if (v < 0)
		v = 0
//console.log("   marg:"+v)
	f = f.replace(/%%leftmargin.*/, "%%leftmargin " + v)
		.replace(/%%rightmargin.*/, "%%rightmargin " + v)
		.replace(/%%stretchstaff.*/, "%%stretchstaff 1")
		.replace(/%%stretchlast.*/, "%%stretchlast 1")
	cfmt = mus.cfmt()
	cfmt.fullsvg = ""
	cfmt.trimsvg = 0

	// do the last generation
//console.log("---\n"+f+"---")
	mus.tunes.shift()			// remove the tune class
	user.img_out = io			// restore the normal output
	mus.tosvg(fn, f)
	abc2svg.fit2box.on = 0
    }, // do_fit()

    tosvg: function(of, fn, file, bol, eof) {
    var	parse = this.parse

	parse.fname = fn
	if (bol == undefined)
		bol = 0
	parse.file = bol != 0 ? file : file.slice(bol)
	parse.eol = 0

	this.tosvg = abc2svg.fit2box.otosvg	// restore the tosvg function
	abc2svg.fit2box.otosvg = null

	abc2svg.fit2box.on = 1
	abc2svg.fit2box.do_fit(this)
    }, // tosvg()

    // get a formatting parameter
    set_fmt: function(of, cmd, parm) {
	if (cmd != "fit2box")
		return of(cmd, parm)
	if (abc2svg.fit2box.on)
		return
	abc2svg.fit2box.on = 1
	parm = parm.match(/(\d+|\*)\s+(\d+|\*)/)
	if (!parm) {					// stop fit2box
		if (abc2svg.fit2box.otosvg) {		// restore the tosvg function
			this.tosvg = abc2svg.fit2box.otosvg
			abc2svg.fit2box.otosvg = null
		}
		return
	}

    var	cfmt = this.cfmt(),
	parse = this.parse,
	f = parse.file,
	wb = parm[1],				// box width
	hb = parm[2]				// box height

	if (wb == "*")
		wb = cfmt.pagewidth
	if (hb == "*")
		hb = cfmt.pageheight || 1123		// (or 29.7cm)
	cfmt.fit2box = [wb, hb]

	// if no tune yet, change the generation function
	if (f.indexOf("X:") < 0) {
		if (!abc2svg.fit2box.otosvg) {
			abc2svg.fit2box.otosvg = this.tosvg
			this.tosvg = abc2svg.fit2box.tosvg.bind(this, this.tosvg)
		}
		return
	}

	// do the fit2box generation now
	parse.file = parse.file.slice(parse.eol)
	parse.eol = 0
	abc2svg.fit2box.do_fit(this)
	parse.file = f
	parse.eol = parse.file.length - 2	// stop the current parsing in tosvg()
    }, // set_fmt()

    set_hooks: function(abc) {
	abc.set_format = abc2svg.fit2box.set_fmt.bind(abc, abc.set_format)
    } // set_hooks()
} // fit2box

if (!abc2svg.mhooks)
	abc2svg.mhooks = {}
abc2svg.mhooks.fit2box = abc2svg.fit2box.set_hooks
