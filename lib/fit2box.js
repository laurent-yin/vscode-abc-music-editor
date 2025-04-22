// fit2box.js - module for filling a tune in a box
//
// Copyright (C) 2025 Jean-François Moine
//
// License LGPL

if (typeof abc2svg == "undefined")
    var	abc2svg = {}

abc2svg.fit2box = {

    // function called on %%fit2box
    set_fmt: function(of, cmd, parm) {
	if (cmd != "fit2box" || abc2svg.fit2box.on)
		return of(cmd, parm)
	parm = parm.match(/(\d+)\s+(\d+)/)
	if (!parm)
		return of(cmd, parm)
	abc2svg.fit2box.on = 1

    var	r, sv, v, w, h, hh, sc,
	wb = parm[1],
	hb = parm[2],
	parse = this.parse,
	f = parse.file,
	fn = parse.fname,
	cfmt = this.cfmt(),
	ob = "",				// output buffer
	io = user.img_out			// save the original img_out

	user.img_out = function(p) {		// function to get the output file
			ob += p
		} // img_out()

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

	this.tosvg(fn, f)				// generate a first time

	// analyse the result of the generation
	w = h = 0
	r = ob.match(/<svg[^>]*/g)
	while (1) {
		sv = r.shift()			// next music line
		if (!sv)
			break
		v = sv.match(/viewBox="0 0 (\d+) (\d+)"/)
		if (!hh) {			// if tune header
			hh = +v[2]
			continue
		}
		if (+v[1] > w)
			w = +v[1]
		h += +v[2]
	}
//console.log("box:"+wb+"x"+hb
//+" w:"+w.toFixed(2)+" h:"+h.toFixed(2)+" hh:"+hh.toFixed(2))

	sc = (hb - hh) / h			// height scale
	v = wb / w				// width scale
//console.log("  scw:"+v.toFixed(2)+" sch:"+sc.toFixed(2))
	if (v < sc)
		sc = v
	if (f.indexOf("%%pagescale ") >= 0)
		f = f.replace(/%%pagescale.*/, "%%pagescale " + sc.toFixed(2))
	else
		f = f.replace(/(K:.*)/, "$1\n%%pagescale " + sc.toFixed(2))

	v = parseInt((wb - (w + 10) * sc) / 2)	// margins
//	v = parseInt((wb - w * sc) / 2)		// margins
	if (v < 0)
		v = 0
//console.log("   marg:"+v)
	f = f.replace(/%%leftmargin.*/, "%%leftmargin " + v)
		.replace(/%%rightmargin.*/, "%%rightmargin " + v)
		.replace(/%%stretchstaff.*/, "%%stretchstaff 1")
		.replace(/%%stretchlast.*/, "%%stretchlast 1")
	cfmt = this.cfmt()
	cfmt.fullsvg = ""
	cfmt.trimsvg = 0

	this.tunes.shift()			// remove the tune class
//console.log("---\n"+f+"---")
	user.img_out = io			// restore the normal output
	this.tosvg(fn, f)			// last generation

	abc2svg.fit2box.on = 0
	parse.eol = parse.file.length - 2	// stop the current parsing in tosvg()
    }, // set_fmt()

    set_hooks: function(abc) {
	abc.set_format = abc2svg.fit2box.set_fmt.bind(abc, abc.set_format)
    } // set_hooks()
} // fit2box

if (!abc2svg.mhooks)
	abc2svg.mhooks = {}
abc2svg.mhooks.fit2box = abc2svg.fit2box.set_hooks
