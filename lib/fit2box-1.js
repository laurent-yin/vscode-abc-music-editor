// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2024 Jean-Francois Moine - LGPL3+
// fit2box.js - module for filling a tune in a box

if (typeof abc2svg == "undefined")
    var abc2svg = {}
abc2svg.fit2box = {
    do_fit: function (mus) {
        var r, sv, v, w, h, hh, sc, marg, tit, cl, parse = mus.parse, f = parse.file, fn = parse.fname, cfmt = mus.cfmt(), wb = cfmt.fit2box[0], hb = cfmt.fit2box[1], io = user.img_out, ob = ""
        user.img_out = function (p) { ob += p }
        if (f.indexOf("\n%%stretchlast") < 0)
            f = "%%stretchlast 0\n" + f
        else
            f = f.replace(/(\n%%stretchlast).*/, "$1 0")
        if (f.indexOf("\n%%stretchstaff") < 0)
            f = "%%stretchstaff 0\n" + f
        else
            f = f.replace(/(\n%%stretchstaff).*/, "$1 0")
        if (f.indexOf("\n%%pagewidth") < 0)
            f = "%%pagewidth " + (wb * 2).toFixed(2) + "\n" + f
        else
            f = f.replace(/(\n%%pagewidth).*/, "$1 " + (wb * 2).toFixed(2))
        if (f.indexOf("\n%%pagescale ") >= 0)
            f = f.replace(/(\n%%pagescale).*/, "$1 .5")
        else
            f = f.replace(/(\nK:.*)/, "$1\n%%pagescale .5")
        cfmt.trimsvg = 1
        cfmt.fullsvg = "a"
        if (abc2svg.fit2box.otosvg)
            abc2svg.fit2box.otosvg(fn, f)
        else
            mus.tosvg(fn, f)
        cfmt = mus.cfmt()
        marg = cfmt.leftmargin + cfmt.rightmargin
        w = h = hh = 0
        r = ob.match(/<svg[^>]*/g)
        if (!r) {
            user.img_out = io
            return
        }
        while (1) {
            sv = r.shift()
            if (!sv)
                break
            v = sv.match(/viewBox="0 0 (\d+) (\d+)"/)
            cl = sv.match(/class="([^"]+)"/)
            if (!tit || cl[1] == "header" || cl[1] == "footer") {
                hh += +v[2]
                if (cl[1] != "header" && cl[1] != "footer")
                    tit = 1
                continue
            }
            if (+v[1] > w)
                w = +v[1]
            h += +v[2]
        }
        w -= marg
        sc = (hb - hh) / h * .5
        v = (wb - marg) / w * .5
        if (v < sc) { sc = v } else {
            v = Math.round(wb * (v - sc) / 2)
            if (v < 0)
                v = 0
            if (v > cfmt.leftmargin)
                f = f.replace(/(%%leftmargin).*/, "$1 " + v).replace(/(%%rightmargin).*/, "$1 " + v)
        }
        f = f.replace(/(%%pagewidth).*/, "$1 " + wb).replace(/(%%pagescale).*/, "$1 " + sc.toFixed(2)).replace(/(%%stretchstaff).*/, "$1 1").replace(/(%%stretchlast).*/, "$1 1")
        cfmt.fullsvg = ""
        cfmt.trimsvg = 0
        mus.tunes.shift()
        user.img_out = io
        if (abc2svg.fit2box.otosvg) {
            mus.tosvg = abc2svg.fit2box.otosvg
            abc2svg.fit2box.otosvg = null
        }
        mus.tosvg(fn, f)
        abc2svg.fit2box.on = 0
    }, tosvg: function (of, fn, file, bol, eof) {
        var parse = this.parse
        parse.fname = fn
        parse.file = bol ? file.slice(bol) : file
        parse.eol = 0
        abc2svg.fit2box.on = 1
        abc2svg.fit2box.do_fit(this)
    }, set_fmt: function (of, cmd, parm) {
        if (cmd != "fit2box")
            return of(cmd, parm)
        if (abc2svg.fit2box.on)
            return
        abc2svg.fit2box.on = 1
        if (!parm) {
            if (abc2svg.fit2box.otosvg) {
                this.tosvg = abc2svg.fit2box.otosvg
                abc2svg.fit2box.otosvg = null
            }
            return
        }
        parm = parm.split(/\s+/)
        var cfmt = this.cfmt(), parse = this.parse, f = parse.file, wb = parm[0], hb = parm[1]
        if (wb == "*") {
            wb = parse.file.match(/\n%%pagewidth\s+([^\s]+)/)
            if (wb)
                wb = wb[1]
        }
        wb = wb ? this.get_unit(wb) : cfmt.pagewidth
        if (hb == "*") {
            hb = parse.file.match(/\n%%pageheight\s+([^\s]+)/)
            if (hb)
                hb = hb[1]
        }
        hb = hb ? this.get_unit(hb) : 1123
        cfmt.fit2box = [wb, hb]
        if (f.indexOf("X:") < 0) {
            if (!abc2svg.fit2box.otosvg) {
                abc2svg.fit2box.otosvg = this.tosvg
                this.tosvg = abc2svg.fit2box.tosvg.bind(this, this.tosvg)
            }
            return
        }
        parse.file = parse.file.slice(parse.eol)
        parse.eol = 0
        abc2svg.fit2box.do_fit(this)
        parse.file = f
        parse.eol = parse.file.length - 2
    }, set_hooks: function (abc) { abc.set_format = abc2svg.fit2box.set_fmt.bind(abc, abc.set_format) }
}
if (!abc2svg.mhooks)
    abc2svg.mhooks = {}
abc2svg.mhooks.fit2box = abc2svg.fit2box.set_hooks
