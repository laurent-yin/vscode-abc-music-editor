// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2026 Jean-François Moine - LGPL3+
// cpp.js - module to preprocess the sources
// cpp.js - module to preprocess the sources
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
// This module is loaded when %%cpp appears in a ABC source.

"use strict"
if (typeof abc2svg == "undefined")
    var	abc2svg = {}

abc2svg.cpp = {

    do_exp: function(mus) {
    var	i, j, k, f, t, ln, macre,
	ctx = {skip: 0},
	mac = {},					// macros
//	doremi = {
//		do:"c", re:"d", "ré":"d", mi:"e", fa:"f", sol:"g", la:"a", si:"b", ti:"b"
//	},
	parse = mus.get_parse(),
	o = parse.file.slice(0, parse.eol)

	// handle the commands and set the context ctx
	function do_cmd(a) {
	    var	i

		a = a.match(/"[^"]*"|[^\s]+/g) || []	// "
		for (i = 1; i < a.length; i++)
			if (a[i][0] == '"')
				a[i] = a[i].slice(1, -1)
		switch (a.shift()) {
//		case "abc":
//			break
		case "define":
//fixme:
// #define \"B=\" \"H\"
			if (a.length == 1)
				mac[a[0]] = null
			else if (a.length == 2)
				mac[a[0]] = a[1]
			macre = null
//			else	error
			break
//		case "doremi":
//			break
		case "else":
			ctx.skip = !ctx.skip
			break
		case "endif":
			ctx.skip = 0
			break
		case "elifdef":
			if (!ctx.skip)
				break
			// fall thru
		case "ifdef":
			ctx.skip = 1
			while (1) {
				i = a.shift()
				if (!i)
					break
				if (mac[i]) {
					ctx.skip = 0
					break
				}
			}
			break
		case "elifndef":
			if (!ctx.skip)
				break
			ctx.skip = 0
			// fall thru
		case "ifndef":
			while (1) {
				i = a.shift()
				if (!i)
					break
				if (mac[i]) {
					ctx.skip = 1
					break
				}
			}
			break
//		case "include":
//			break
		case "redefine":
		case "resume":
			ctx.susp = 0
			break
		case "suspend":
		case "undefine":
			ctx.susp = 1
			break
		}
	} // do_cmd()

	// expand text
	function exp(p) {			// text
		if (!p || !Object.keys(mac).length)
			return p		// no macro yet
		if (!macre)
			macre = new RegExp(Object.keys(mac).join("|"), "g")
		return p.replace(macre, function(k, i) {
				return p[i - 1] == '\\' ? k : mac[k]
			})
	} // exp()

	// loop on the '#'commands
	f = parse.file				// music source
	j = k = parse.eol			// index of the end of the command

	while (1) {
		i = f.indexOf("\n#", j)
		o += !ctx.skip && !ctx.susp
			? exp(f.slice(k, i >= 0 ? i : f.length))
			: f.slice(k, i >= 0 ? i : f.length).replace(/[^\n]+/g, '%')
		if (i < 0)
			break
		i += 2
		j = f.indexOf("\n", i)
		do_cmd(f.slice(i, j))
		o += '\n%'			// keep sources in sync
		k = j
	}
//console.log("----- generated\n"+o)

	// generate and return
	abc2svg.cpp.otosvg.call(mus, parse.fname, o, 0, o.length)
    }, // do_exp()

	// expand the source
    tosvg: function(of, fn, file, bol, eof) {
    var	parse = this.get_parse()

	parse.fname = fn
	parse.file = file
	parse.eol = bol

	abc2svg.cpp.do_exp(this)
    }, // tosvg()

	// hook on %%command's
    do_pscom: function(of, parm) {
    var	parse = this.get_parse(),
	f = parse.file,
	i = parm.match(/[^\s]+/)

	if (i[0] != "cpp")
		return of(parm)
	if (abc2svg.cpp.otosvg)
		return

	// switch the source entry
	abc2svg.cpp.otosvg = this.tosvg
	this.tosvg = abc2svg.cpp.tosvg.bind(this, this.tosvg)

	// and start expanding now
	abc2svg.cpp.do_exp(this)

	parse.file = f
	parse.eol = f.length			// stop the previous generation
    }, // do_pscom()

    set_hooks: function(abc) {
	abc.do_pscom = abc2svg.cpp.do_pscom.bind(abc, abc.do_pscom)
    }
} // cpp()

if (!abc2svg.mhooks)
	abc2svg.mhooks = {}
abc2svg.mhooks.cpp = abc2svg.cpp.set_hooks
