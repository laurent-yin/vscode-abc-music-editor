const vscode = acquireVsCodeApi();
let abc;
let user; // IMPORTANT: user needs to be in the global scope for some modules to work properly (e.g. page module)

// variables needed for playback
let play = {},
tunes,
selx = [0, 0], // (start, end) of the selection
selx_sav = []; // (saved while playing/printing)

// callback called by abc2svg to load the modules it needs as part of its processing
abc2svg.loadjs = function (fn, relay, onerror) {
    let script = document.createElement('script');
    script.src = `${window.baseUri}/lib/${fn}`;
    script.type = 'text/javascript';
    script.onload = (event) => {
        console.log('loaded module ' + fn);
        if (relay) { relay(event); }
    }
    script.onerror = (event) => {
        if (onerror) { onerror(event); }
        console.log('error loading module ' + fn);
    }    
    document.head.appendChild(script);
}

// load snd-1.js for midi playback
abc2svg.loadjs("snd-1.js", function () {
    console.log("snd-1.js loaded successfully");
    play.abcplay = AbcPlay({
        onend: endplay,
        onnote: note => console.log("Playing note:", note),
    });
});

// process messages received from the extension
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'render') {
        const content = msg.content;
        const div = document.getElementById('sheet');
        div.innerHTML = '';

        if (abc2svg) {
            let abc_images = '';
            user = {
                img_out: s => { abc_images += s; },
                imagesize: 'width="100%"',
                errmsg: (msg, line, col) => { vscode.postMessage({ command: 'error', message: msg, line, col }); },
                page_format: true
            };
            
            function renderAbc(content, div) {
                console.log('rendering ABC content');
                abc.tosvg('abc', content);
                div.innerHTML = abc_images;
                if (abc_images === '') {
                    console.log('no images generated');
                }
            }

            abc = new abc2svg.Abc(user);
            if (abc2svg.modules.load(content, () => {
                console.log('rendering after loading modules');
                renderAbc(content, div, abc_images);
            }, console.error)) {
                // modules were already loaded, callback won't be called, so call it manually
                console.log('rendering when modules.load returns true');
                renderAbc(content, div, abc_images);
            }
        }
    }
});

// TODO when clicking on a note, it selects the corresponding ABC
document.addEventListener('click', event => {
    const cls = String(event.target?.className?.baseVal || event.target?.className || '');
    if (cls.startsWith('selMarker')) {
        const match = cls.match(/_(\d+)-(\d+)_/);
        if (match) {
            vscode.postMessage({ command: 'selection', start: +match[1], stop: +match[2] });
        }
    }
});

/** PLAYBACK IMPLEMENTATION, WORK IN PROGRESS **/

document.getElementById('play-button').addEventListener('click', () => {
    console.log('clicked on play');
    if (play.abcplay) {
        console.log('launching play');
        play_tune(0); // play the whole tune
    }
});

// start playing
//	-1: All (removed)
//	0: Tune
//	1: Selection
//	2: Loop
//	3: Continue
function play_tune(what) {
	if (!abc)
		return			// no generation yet
    var	i, si, ei, elt,
	C = abc2svg.C

	if (play.playing) {
		if (!play.stop) {
			play.stop = -1;
			play.abcplay.stop()
		}
		return
	}

	// search a symbol to play
	function gnrn(sym, loop) {	// go to the next real note (not tied)
	    var	i
		while (1) {
			switch (sym.type) {
			case C.NOTE:
				i = sym.nhd + 1
				while (--i >= 0) {
					if (sym.notes[i].ti2)
						break
				}
				if (i < 0)
					return sym
				break
			case C.REST:
			case C.GRACE:
				return sym
			case C.BLOCK:
				switch (sym.subtype) {
				case "midictl":
				case "midiprog":
					return sym
				}
				break
			}
			if (!sym.ts_next) {
				if (!loop)
					return gprn(sym, 1)
				return sym
			}
			sym = sym.ts_next
		}
		// not reached
	}

	function gprn(sym, loop) {	// go to the previous real note (not tied)
	    var	i
		while (1) {
			switch (sym.type) {
//			case C.BAR:
//fixme: there may be a right repeat!
//			break
			case C.NOTE:
				i = sym.nhd + 1
				while (--i >= 0) {
					if (sym.notes[i].ti2)
						break
				}
				if (i < 0)
					return sym
				break
			case C.REST:
			case C.GRACE:
				return sym
			case C.BLOCK:
				switch (sym.subtype) {
				case "midictl":
				case "midiprog":
					return sym
				}
				break
			}
			if (!sym.ts_prev) {
				if (!loop)
					return gnrn(sym, 1)
				return sym
			}
			sym = sym.ts_prev
		}
		// not reached
	}

	function gsot(si) {		// go to the first symbol of a tune
	    var	sym = syms[si].p_v.sym

		while (!sym.seqst)
			sym = sym.ts_prev
		return sym
	}
	function get_se(si) {			// get the starting symbol
	    var	sym = syms[si]

		while (!sym.seqst)
			sym = sym.ts_prev
		return sym
	} // get_se()

	function get_ee(si) {			// get the ending symbol
	    var	sym = syms[si]

		while (sym.ts_next && !sym.ts_next.seqst)
			sym = sym.ts_next
		return sym
	} // get_ee()

	// start playing
	function play_start(si, ei) {
		if (!si)
			return
		selx_sav[0] = selx[0];		// remove the colors
		selx_sav[1] = selx[1];
		setsel(0, 0);
		setsel(1, 0);

		play.stop = 0;
		play.abcplay.play(si, ei, play.repv)
	}

	// play tune()
	// ctxMenu.style.display = "none";	// remove the play menu

	play.playing = true;
	if (tunes != abc.tunes) {		// if new display
		tunes = abc.tunes

		// generate the play data of all tunes
		for (i = 0; i < tunes.length; i++) {
			elt = tunes[i]
			play.abcplay.add(elt[0], elt[1], elt[3])
		}

		play.si = play.ei = null
		play.stop = 0
		play.loop = false
	}

	// if loop again
	if (what == 2 && play.loop) {
		play_start(play.si, play.ei)
		return
	}

	// get the starting and ending play indexes, and start playing

	if (what == 3 && play.stop > 0) {	// if stopped and continue
		play_start(get_se(play.stop), play.ei)
		return
	}
	if (what != 0 && selx[0] && selx[1]) {	// if full selection
		si = get_se(selx[0]);
		ei = get_ee(selx[1])
	} else if (what != 0 && selx[0]) {	// if selection without end
		si = get_se(selx[0]);
		ei = null
	} else if (what != 0 && selx[1]) {	// if selection without start
		si = gsot(selx[1])
		ei = get_ee(selx[1])
	} else {				// no selection => tune

        // TODO: use the class name of the clicked element to get the tune number
		/* elt = play.click.svg		// (dummy)
		si = elt.getAttribute('class') */

        si = 'tune0' // dummy for tests
		si = /tune(\d*)/.exec(si)
		if (!si) {
			play.playing = 0 //false
			return			// no tune here
		}
		si = tunes[si[1]][0]		// first symbol of the tune
		ei = si
		while (ei && !ei.dur)
			ei = ei.ts_next
		if (!ei) {
			play.playing = 0 //false
			return			// nothing to play
		}
		ei = null
	}

	if (what != 3) {		// if not continue
		play.si = si;
		play.ei = ei;
		play.loop = what == 2
		play.repv = 0
	}

	play_start(si, ei)
}

// set/clear a selection
function setsel(idx, v) {
    var i, elts, s,
	old_v = selx[idx];

	if (v == old_v)
		return
	if (old_v) {
		elts = document.getElementsByClassName('_' + old_v + '_');
		i = elts.length
		while (--i >= 0)
			elts[i].style.fillOpacity = 0
	}
	if (v) {
		elts = document.getElementsByClassName('_' + v + '_');
		i = elts.length
		while (--i >= 0)
			elts[i].style.fillOpacity = 0.4
	}

	selx[idx] = v
}

// playing is finished
function endplay(repv) {
	if (play.loop) {
		play.abcplay.play(play.si, play.ei)
		return
	}
	play.playing = false;
	play.repv = repv		// repeat variant number for continue

	// redisplay the selection
	selx[0] = selx[1] = 0;
	setsel(0, selx_sav[0]);
	setsel(1, selx_sav[1])
}