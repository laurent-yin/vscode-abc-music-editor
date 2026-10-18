// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2026 Jean-François Moine - LGPL3+
// snd-1.js - file to include in html pages with abc2svg-1.js for playing
// sndgen.js - sound generation
// sndaud.js - audio output using HTML5 audio
/*! JavaScript SoundFont 2 Parser. Copyright 2013-2015 imaya/GREE Inc and Colin Clark. Licensed under the MIT License. */
// sndmid.js - audio output using HTML5 MIDI
// follow-1.js - file included in snd-1.js
// chord.js - generation of accompaniment
// drum.js - generation of drum sequences
// snd-1.js - file to include in html pages with abc2svg-1.js for playing
//
// Copyright (C) 2015-2026 Jean-François Moine
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

// This file is a wrapper around
// - ToAudio (sndgen.js): generate the play data
// - Audio5 (sndaud.js): play with HTML5 audio API and SF2
// - Midi5 (sndmid.js): play with HTML5 MIDI api
// old version:
// - ToAudio (toaudio.js - convert ABC to audio sequences)
// - Audio5 (toaudio5.js - play the audio sequences with webaudio and SF2)
// - Midi5 (tomidi5.js - play the audio sequences with webmidi)

// AbcPlay methods:
//
// set_sfu() - get/set the soundfont URL
// @url: URL - undefined = return current value
//
// set_speed() - get/set the play speed
// @speed: < 1 slower, > 1 faster - undefined = return current value
//
// set_vol() - get/set the current sound volume
// @volume: range [0..1] - undefined = return current value

function AbcPlay(i_conf) {
    var	conf = i_conf,
	init = {},
	audio = ToAudio(),
	audio5, midi5, current,
	abcplay = {				// returned object (only instance)
		clear: audio.clear,
		add: audio.add,
		set_sfu: function(v) {
			if (v == undefined)
				return conf.sfu
			conf.sfu = v
		},
		set_speed: function(v) {
			if (v == undefined)
				return conf.speed
			conf.new_speed = v
		},
		set_vol: function(v) {
			if (v == undefined)
				return conf.gain;
			conf.gain = v
			if (current && current.set_vol)
				current.set_vol(v)
		},
		play: play,
		stop: vf
	}

	function vf() {}			// void function

	// start playing when no defined output
	function play(istart, i_iend, a_e, loop) {
		init.istart = istart;
		init.i_iend = i_iend;
		init.loop = loop
		init.a_e = a_e
		if (midi5)
			midi5.get_outputs(play2) // get the MIDI ports
		else
			play2()
	} // play()

	// if set, out contains an array of the MIDI output ports
	function play2(out) {
	    var o,
		n = window.sessionStorage && sessionStorage.getItem("audio")

		if (!out)
			out = []
		o = audio5.get_outputs()	// get the HTML5 audio port
		if (o)
			Array.prototype.push.apply(out, o)
		if (out.length == 0) {
			if (conf.onend)		// no output port
				conf.onend()
			return
		}
		if (out.length == 1) {
			o = 0			// only one port
		} else {
			if (n) {		// if port selected in a previous page
				for (o = 0; o < out.length; o++)
					if (out[o] == n)
						break
			}
		    if (!n || o >= out.length) {
			o = -1			// ask which port?
			var pr = "Use"
			for (var i = 0; i < out.length; i++)
				pr += "\n " + i + ": " + out[i]
			var res = window.prompt(pr, '0')
			if (res) {
				o = Number(res)
				if (isNaN(o) || o < 0 || o >= out.length)
					o = -1
			}
			if (!res || o < 0) {
				if (conf.onend)
					conf.onend()
				return
			}

			// memorize the output port for the next pages of the same session
			if (window.sessionStorage)
				sessionStorage.setItem("audio", out[o])
		    }
		}

		// set the current output changing the play functions
		current = out[o] == 'sf2' ? audio5 : midi5;
		abcplay.play = current.play;
		abcplay.stop = current.stop
		if (current.set_output)
			current.set_output(out[o]);
		abcplay.play(init.istart, init.i_iend, init.a_e, init.loop)
	} // play2()

	// set default configuration values
	conf.gain = 0.7;
	conf.speed = 1;

	// get the play parameters from localStorage
	(function() {
	    var	v
		try {
			if (!localStorage)
				return
		} catch (e) {
			return
		}
	    if (!conf.sfu) {
		v = localStorage.getItem("sfu")
		if (v)
			conf.sfu = v;
	    }
		v = localStorage.getItem("volume")
		if (v)
			conf.gain = Number(v)
	})()

	// initialize the playing engines
	if (typeof Midi5 == "function")
		midi5 = Midi5(conf)
	if (typeof Audio5 == "function")
		audio5 = Audio5(conf);

	return abcplay
} // AbcPlay

// nodejs
if (typeof module == 'object' && typeof exports == 'object')
	exports.AbcPlay = AbcPlay
// sndgen.js - sound generation
//
// Copyright (C) 2019-2026 Jean-Francois Moine
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

// This script generates the play data which are stored in the music symbols:
// - in all symbols
//	s.ptim = play time
// - in BAR
//	rep_p = on a right repeat bar, pointer to the left repeat symbol
//	rep_s = on the first repeat variant, array of pointers to the next symbols,
//						indexed by the repeat number
// - in NOTE and REST
//	s.pdur = play duration
// - in the notes[] of NOTE
//	s.notes[i].midi

if (!abc2svg)
    var	abc2svg = {}

// tempo table
	abc2svg.tmp_tb = {
		grave:		30,
		lento:		40,
		largo:		50,
		adagio:		66,
		andante:	86,
		moderato:	96,
		allegretto:	112,
		allegro:	130,
		vivace:		150,
		presto:		180,
		prestissimo:	210
	}

function ToAudio() {
 return {

   // generate the play data of a tune
   add: function(first,		// starting symbol
		voice_tb,	// voice table
		cfmt) {		// tune parameters
    var	toaud = this,
	C = abc2svg.C,
	p_time = 0,		// last playing time
	abc_time = 0,		// last ABC time
	play_fac = C.BLEN / 4 * 120 / 60, // play time factor - default: Q:1/4=120
	dt, s_m, d,
	s = first,
	rst = s,		// left repeat (repeat restart)
	rst_fac,		// play factor on repeat restart
	rsk = [],		// repeat variant array (repeat skip)
	b_tim,			// time of last measure bar
	b_typ			// type of last measure bar

	function get_beat() {
	    var	s = first.p_v.meter

		if (!s.a_meter[0])
			return C.BLEN / 4
		if (!s.a_meter[0].bot)
			return (s.a_meter[1]
				&& s.a_meter[1].top == '|')	// (cut time)
					? C.BLEN / 2 : C.BLEN / 4
		if (s.a_meter[0].bot == "8"
		 && s.a_meter[0].top % 3 == 0)
			return C.BLEN / 8 * 3
		return C.BLEN / s.a_meter[0].bot | 0
	} // get_beat()

	// create the starting beats
	function def_beats() {
	    var	i, s2, s3, tim,
		nb,				// number of beats
		npv = cfmt.playbeats.split(/\s+/),
		beat = get_beat(),		// time between two beats
		d = first.p_v.meter.wmeasure,	// duration of a measure
		v = voice_tb.length,		// beat voice number
		p_v = {				// voice for the beats
			id: "_beats",
			v: v,
//			time:
			sym: {
				type: C.BLOCK,
				v: v,
//				p_v: p_v,
				subtype: "midiprog",
				chn: 9,			// percussion channel
				instr: 16384,	// percussion bank
//				time:
//				next:
				ts_prev: first
//				ts_next: 
			}
//			vol:
		},
		s = {
			type: C.NOTE,
			v: v,
			p_v: p_v,
//			time:
			dur: beat,
			nhd: 0,
			notes: [{
				midi: 37	// Side Stick
			}]
		}

		i = Number(npv[0])		// number of measures
		if (!isNaN(i))
			d *= i
		i = Number(npv[1])		// drum instrument
		if (!isNaN(i))
			s.notes[0].midi = i

		// check for an anacrusis
		for (s2 = first; s2; s2 = s2.ts_next) {
			if (s2.bar_type && s2.time) {
				nb = (d + first.p_v.meter.wmeasure - s2.time) / beat | 0
				abc_time = -beat * nb	// start time of the beat ticks
				break
			}
		}

		// add the tempo
		s2 = p_v.sym			// midiprog
		for (s3 = first; s3 && !s3.time; s3 = s3.ts_next) {
			if (s3.type == C.TEMPO) {
				s3 = Object.create(s3)	// new tempo
				s3.v = v
				s3.p_v = p_v
				s3.prev =
					s3.ts_prev = s2
				s2.next =
					s2.ts_next = s3
				s2 = s3
				play_fac = set_tempo(s2)
				break
			}
		}

		voice_tb[v] = p_v
		p_v.sym.p_v = p_v
		first.time = s2.time = tim = abc_time
		if (s3)
			p_v.sym.time = tim
		for (i = 0; i < nb; i++) {
			s3 = Object.create(s)	// new beat tick
			s3.time = tim
			s3.prev = s2
			s2.next = s3
			s3.ts_prev = s2
			s2.ts_next = s3
			s2 = s3
			tim += beat
		}
		s2.ts_next = first.ts_next
		s2.ts_next.ts_prev = s2
		first.ts_next = p_v.sym
		rst = s2.ts_next
	} // def_beats()

	// build the information about the parts (P:)
	function build_parts(first) {
	    var	i, j, c, n, v,
		s = first,
		p = s.parts,
		st = [],
		r = ""

		// build a linear string of the parts
		for (i = 0; i < p.length; i++) {
			c = p[i]
			switch (c) {
			case '.':
				continue
			case '(':
				st.push(r.length)
				continue
			case ')':
				j = st.pop()
				if (j == undefined)
					j = r.length
				continue
			}
			if (c >= 'A' && c <= 'Z') {
				j = r.length
				r += c
				continue
			}
			n = Number(c)
//fixme:one digit is enough!
//			while (1) {
//				c = p[i + 1]
//				if (c < '0' || c > '9')
//					break
//				n = n * 10 + Number(c)
//				i++
//			}
			if (isNaN(n))
				break
			v = r.slice(j)
			if (r.length + v.length * n > 128)
				continue
			while (--n > 0)
				r += v
		}
		s.parts = r

		// build the part table in the first symbol
		// and put the reverse pointers in the P: symbols
		s.p_s = []			// pointers to the parts
		while (1) {
			s = s.ts_next
			if (!s)
				break
			if (s.part) {
				s.part1 = first		// reverse pointer
				v = s.part.text[0]	// 1st letter only
				for (i = 0; i < first.parts.length; i++) {
					if (first.parts[i] == v)
						first.p_s[i] = s
				}
			}
		}
	} // build_parts()

	// update the time linkage when the start time has changed
	function relink(s, dt) {
	    var	s2

		s.time += dt			// update time and duration
		if (s.dur)
			s.dur -= dt
		s.seqst = 1 //true		// new time sequence

		if (dt < 0) {			// if move backwards the grace notes
			s2 = s
			do {
				s2 = s2.prev
			} while (s2 && !s2.dur)
			if (s2) {
				s2.dur += dt
				s2.pdur = s2.dur / play_fac
				while (s2 && s2.time >= s.time)
					s2 = s2.prev
				if (s2)
					s2 = s2.next
			}
		} else {
			s2 = s.ts_next
			while (s2 && s2.time < s.time)
				s2 = s2.ts_next
		}

		// update the time linkage
		if (s2
		 && s2 != s
		 && s2 != s.ts_next) {
			s.ts_prev.ts_next = s.ts_next	// remove from the time linkage
			if (s.ts_next)
				s.ts_next.ts_prev = s.ts_prev
			s.ts_prev = s2.ts_prev		// new linkage
			s.ts_next = s2
			if (s2.ts_prev)
				s2.ts_prev.ts_next = s
			s.ts_next.ts_prev = s
			if (s2.time == s.time)
				s2.seqst = 0 //false
		} else if (s.ts_next) {
			s.ts_next.seqst = 1
		}
	} // relink()

	// generate the grace notes
	function gen_grace(s) {
		if (s.midgen)
			return s			// generation already done
		s.midgen = 1 //true
	    var	g, i, n, t, d, prev, s2,
		next = s.next

//fixme: assume the grace notes in the sequence have the same duration
		n = 0
		for (g = s.extra; g; g = g.next)
			n++				// number of notes

		prev = s.prev
		while (prev && !prev.dur)		// search the previous note/rest
			prev = prev.prev

		// before beat
		if (prev
		 && (s.sappo
		  || !next || next.type != C.NOTE)) {
			if (s.sappo) {
				d = C.BLEN / 16
				if (d > prev.dur / 3)
					d = prev.dur / 3
			} else {
				d = prev.dur / 2
			}
			if (s.fmt.gracedur != null)
				d *= s.fmt.gracedur
			s2 = s.ts_next			// (the grace note will move)
			relink(s, -d)
			s.ptim -= d / play_fac

		// on beat
		} else {
			d = next.dur / 12
			if (!(d & (d - 1)))
				d = next.dur / 2	// no dot
			else
				d = next.dur / 3
			if (s.p_v.key.k_bagpipe)
				d /= 2
			if (d / n < 24)
				d = 24 * n
			if (s.sappo		// (appogiatura at start of tune!)
			 && d > C.BLEN / 16)
				d = C.BLEN / 16
			if (s.fmt.gracedur != null)
				d *= s.fmt.gracedur
			relink(next, d)
			s2 = s.ts_next			// (the normal note moved)
		}

		s.dur = d
		s.pdur = d / play_fac
		d /= n * play_fac
		t = 0
		for (g = s.extra; g; g = g.next) {
			g.dtim = t
			g.pdur = d
			t += d
		}
		return s2.ts_prev
	} // gen_grace()

	// change the tempo
	function set_tempo(s) {
		if (!s.tempo && !s.new_beat) {
		    var	p = (s.tempo_str1 || s.tempo_str2)
			if (!p)
				return play_fac		// no change
		    var	upm = abc2svg.tmp_tb[p.toLowerCase()]

			if (!upm)
				return play_fac		// no change
			upm *= C.BLEN / 240 // (/4/60)
			if (!s_m.a_meter)
				return upm
			if (!s_m.a_meter[0].bot)
				return (s_m.a_meter[1] && s_m.a_meter[1].top == '|')
						? upm * 2 : upm
			if (s_m.a_meter[0].bot == "8"
			 && !(s_m.a_meter[0].top % 3))
			 	return upm / 2 * 3
			return upm * s_m.a_meter[0].bot / 4
		}
	    var	i,
		d = 0,
		n = s.tempo_notes.length

		for (i = 0; i < n; i++)
			d += s.tempo_notes[i]
		if (s.new_beat)
			return play_fac * s.new_beat / d
		return d * s.tempo / 60
	} // set_tempo()

	function set_variant(s) {
	    var	d,
		n = s.text.match(/[1-8]-[2-9]|[1-9,.]|[^\s]+$/g)

		while (1) {
			d = n.shift()
			if (!d)
				break
			if (d[1] == '-')
				for (i = d[0]; i <= d[2]; i++)
					rsk[i] = s
			else if (d >= '1' && d <= '9')
				rsk[Number(d)] = s
			else if (d != ',')
				rsk.push(s)	// last
		}
	} // set_variant()

	// add() main

	// if %%playswing, change the couples of 8th notes
	if (abc2svg.swing)			// if the module is loaded
		abc2svg.swing.swing(first, voice_tb, cfmt)

	// if some chord stuff, set the accompaniment data
	if (cfmt.chord)
		abc2svg.genchrd(first, voice_tb, cfmt)

	// if some drum stuff, generate the drum sequences
	if (cfmt.drum)
		abc2svg.gendrum(s, voice_tb, cfmt)

	// if %%playbeats, create the sounds
	s_m = first.p_v.meter			// current meter
	if (cfmt.playbeats
	  && first.p_v.meter.wmeasure != 1)	// if not M:none
		def_beats()

	if (s.parts)
		build_parts(s)

	// set the time parameters
	rst_fac = play_fac
	while (s) {
		if (s.noplay) {			// in display macro sequence
			s = s.ts_next
			continue
		}

		dt = s.time - abc_time
		if (dt != 0) {		// may go backwards after grace notes
			p_time += dt / play_fac
			abc_time = s.time
		}
		s.ptim = p_time

		if (s.part) {			// new part
			rst = s			// new possible restart
			rst_fac = play_fac
		}
		switch (s.type) {
		case C.BAR:
			if (s.time != b_tim) {
				b_tim = s.time
				b_typ = 0
			}
			if (s.text			// if new variant
			 && rsk.length > 1
			 && s.text[0] != '1') {
				if (b_typ & 1)
					break
				b_typ |= 1
				set_variant(s)
				play_fac = rst_fac
				rst = rsk[0]		// reinit the restart
			}

			// right repeat
			if (s.bar_type[0] == ':') {
				if (b_typ & 2)
					break
				b_typ |= 2
				s.rep_p = rst		// :| to |:
				if (rst == rsk[0])
					s.rep_v = rsk	// to know the number of variants
			    if (!s.text)		// if no :|2
				rst = s			// possible restart (..:|..:|)
			}

			// 1st time repeat
			if (s.text) {
			    if (s.text[0] == '1') {
				if (b_typ & 1)
					break
				b_typ |= 1
				if (s.bar_type.slice(-1) == ':')
					rst = s
				s.rep_s = rsk = [rst]	// repeat skip
							// and memorize the restart
				if (rst.bar_type
				 && rst.bar_type.slice(-1) != ':')
					rst.bar_type += ':' // restart confirmed
				set_variant(s)
				rst_fac = play_fac
			    }

			// left repeat
			} else if (s.bar_type.slice(-1) == ':') {
				if (b_typ & 4)
					break
				b_typ |= 4
				rst = s			// new possible restart
				rst_fac = play_fac
// fixme: does not work when |1 split at end of line
//			} else if (s.rbstop == 2) {
//				if (b_typ & 8)
//					break
//				b_typ |= 8
//				rst = s			// new possible restart
//				rst_fac = play_fac
			}
			break
		case C.GRACE:
			s = gen_grace(s)
			break
		case C.REST:
		case C.NOTE:
			d = s.dur
			d /= play_fac
			s.pdur = d
			break
		case C.METER:
			s_m = s				// current meter
			break
		case C.TEMPO:
			play_fac = set_tempo(s)
			break
		}
		s = s.ts_next
	} // loop
   } // add()
 } // return
} // ToAudio()

// play some next symbols
//
// This function is called to start playing.
// Playing is stopped on either
// - reaching the 'end' symbol (not played) or
// - reaching the end of tune or
// - seeing the 'stop' flag (user request).
//
// The po object (Play Object) contains the following items:
// - variables
//  - stop: stop flag
//		set by the user to stop playing
//  - s_cur: current symbol (next to play)
//		must be set to the first symbol to be played at startup time
//  - s_end: stop playing on this symbol
//		this symbol is not played. It may be null.
//  - conf
//    - speed: current speed factor
//		must be set to 1 at startup time
//    - new_speed: new speed factor
//		set by the user
// - internal variables
//  - stim: start time
//  - repn: don't repeat
//  - repv: variant number
//  - repp: current left repeat
//  - timouts: array of the current timeouts
//		this array may be used by the upper function in case of hard stop
//  - p_v: voice table used for MIDI control
// - methods
//  - onend: (optional)
//  - onnote: (optional)
//  - note_run: start playing a note
//  - get_time: return the time of the underlaying sound system
abc2svg.play_next = function(po) {

	// handle a tie
	function do_tie(not_s, d) {
	    var	i,
		s = not_s.s,
		C = abc2svg.C,
		v = s.v,
		end_time = s.time + s.dur,
		repv = po.repv

		// search the end of the tie
		while (1) {
			s = s.ts_next
			if (!s || s.time > end_time)
				break
			if (s.type == C.BAR) {
				if (s.rep_p) {
					if (!po.repn) {
						s = s.rep_p
						end_time = s.time
					}
				}
				if (s.rep_s) {
					if (!s.rep_s[repv])
						break
					s = s.rep_s[repv++]
					end_time = s.time
				}
				while (s.ts_next && !s.ts_next.dur)
					s = s.ts_next
				continue
			}
			if (s.time < end_time
			 || !s.ti2)			// if not end of tie
				continue

			i = s.notes.length
			while (--i >= 0) {
				note = s.notes[i]
				if (note.tie_s == not_s) {
					d += s.pdur / po.conf.speed
					return note.tie_e ? do_tie(note, d) : d
				}
			}
		}

		return d
	} // do_tie()

	// set the MIDI controls up to now
	function set_ctrl(po, s2, t) {
	    var	i,
		p_v = s2.p_v,
		s = {
			subtype: "midictl",
			p_v: p_v,
			v: s2.v
		}

		p_v.vol = p_v.pan = undefined	// reset the controllers

		for (i in p_v.midictl) { // MIDI controls at voice start time
			s.ctrl = Number(i)
			s.val = p_v.midictl[i]
			po.midi_ctrl(po, s, t)
		}
		for (s = p_v.sym; s != s2; s = s.next) {
			if (s.subtype == "midictl") {
				po.midi_ctrl(po, s, t)
			} else if (s.subtype == 'midiprog') {
				po.v_c[s.v] = s.chn
				if (s.instr != undefined)
					po.c_i[po.v_c[s.v]] = s.instr
				po.midi_prog(po, s)
			}
		}

		// if no %%MIDI, set 'grand acoustic piano' as the instrument
		i = po.v_c[s2.v]
		if (i == undefined)
			po.v_c[s2.v] = i = s2.v < 9 ? s2.v : s2.v + 1
		if (po.c_i[i] == undefined)
			po.c_i[i] = 0	// piano
		while (p_v.voice_down) {
			p_v = p_v.voice_down
			po.v_c[p_v.v] = i
		}
		po.p_v[s2.v] = true	// synchronization done
	} // set_ctrl()

    // start and continue to play
    function play_cont(po) {
    var	d, i, st, m, n, note, g, s2, t, maxt, now, p_v,
	C = abc2svg.C,
	s = po.s_cur

	// search the end of a sequence of variants
	function var_end(s) {
	    var	i, s2, s3,
		a = s.rep_v || s.rep_s
		ti = 0

		for (i = 1; i < a.length; i++) {
			s2 = a[i]
			if (s2.time > ti) {
				ti = s2.time
				s3 = s2
			}
		}
		for (s = s3; s != po.s_end; s = s.ts_next) {
			if (s.time == ti)
				continue
			if (s.rbstop == 2)
				break
		}
		po.repv = 1		// repeat end
		return s
	} // var_end()

	while (s.noplay) {
		s = s.ts_next
		if (!s || s == po.s_end) {
			if (po.onend)
				po.onend(po.repv)
			return
		}
	}
	t = po.stim + s.ptim / po.conf.speed	// start time
	now = po.get_time(po)

	// if speed change, shift the start time
	if (po.conf.new_speed) {
		po.stim = t - s.ptim / po.conf.new_speed
		po.conf.speed = po.conf.new_speed
		po.conf.new_speed = 0
	}

	maxt = t + po.tgen		// max time = now + 'tgen' seconds
	po.timouts = []
	s2 = null			// used when time jump

	while (1) {

		// check if end of part
		if ((!s || s.part1)
		 && po.ps) {
			s2 = po.ps[++po.i_p]
			if (!s2)
				s = s2 = null
			po.repv = 1
		}

		// handle the time jumps
		if (!s2
		 && po.s_loop
		 && (!s || s == po.s_end)
		 && !po.stop) {
			po.i_p = 0
			s2 = po.ps ? po.ps[0] : po.s_loop.ts_next
			if (s2.p_v.id == "_beats") {
				while (s2?.p_v.id == "_beats")
					s2 = s2.ts_next
			}
			po.repn = 0 //false
			po.repv = 1
			po.repp = null
		}

		if (s2) {
			s = s2
			s2 = null
			po.stim = t - s.ptim / po.conf.speed
			t = po.stim + s.ptim / po.conf.speed // next time
			while (s && !s.dur)
				s = s.ts_next
		}

		if (!s || s == po.s_end		// check if end of playback
		 || po.stop) {
			if (po.onend)
				setTimeout(po.onend,
					(t - now + d) * 1000,
					po.repv)
			po.s_cur = s
			return
		}
		if (s.noplay) {
			s = s.ts_next		// skip display only symbols
			continue
		}
		if (t > maxt)
			break			// let's sleep

		// do the sounding stuff
		switch (s.type) {
		case C.BLOCK:
			if (s.subtype == "midictl") {
				po.midi_ctrl(po, s, t)
			} else if (s.subtype == 'midiprog') {
				po.v_c[s.v] = s.chn
				if (s.instr != undefined)
					po.c_i[po.v_c[s.v]] = s.instr
				po.midi_prog(po, s)
				p_v = s.p_v
				while (p_v.voice_down) {
					p_v = p_v.voice_down
					po.v_c[p_v.v] = s.chn
				}
			}
			break
		case C.GRACE:
			if (!po.p_v[s.v])
				set_ctrl(po, s, t)
			for (g = s.extra; g; g = g.next) {
				d = g.pdur / po.conf.speed
				for (m = 0; m <= g.nhd; m++) {
					note = g.notes[m]
					if (!note.noplay)
					    po.note_run(po, g,
						note.midi,
						t + g.dtim,
//fixme: there may be a tie...
						d)
				}
			}
			break
		case C.NOTE:
		case C.REST:
			if (!po.p_v[s.v])		// if new voice
				set_ctrl(po, s, t)	// set the MIDI controls
			d = s.pdur / po.conf.speed
		    if (s.type == C.NOTE) {
			for (m = 0; m <= s.nhd; m++) {
				note = s.notes[m]
				if (note.tie_s		// end of tie
				 || note.noplay)	// (%%voicecombine)
					continue	// already generated
				po.note_run(po, s,
					note.midi,
					t,
					note.tie_e ?
						do_tie(note, d) : d)
			}
		    }

			// follow the notes/rests while playing
			if (po.onnote && s.istart) {
				i = s.istart
				st = (t - now) * 1000
				po.timouts.push(setTimeout(po.onnote, st, i, true))
				if (d > 2)	// problem when loop on one long note
					d -= .1
				setTimeout(po.onnote, st + d * 1000, i, false)
			}
			break
		}
		if (!s.bar_type) {
			if (s.ts_next) {
				s = s.ts_next
				if (s.ptim != s.ts_prev.ptim)
					t = po.stim + s.ptim / po.conf.speed
			} else {
			    if (s.p_dur)
				t += s.pdur / po.conf.speed
				s = null
			}
			continue
		}
		if (s.rep_p) {			// right repeat
			if (s.rep_p != po.repp) {	// the left repeat changes
				po.repv = 1
				po.repp = s.rep_p
			}
			if (s.rep_v) {		// if variants
				n = s.rep_v.length
			} else {		// else number of ':'s
				n = s.bar_type.match(/(:+)[|[\]]/)
				n = (n ? n[1].length : 1) + 2
			}
			if (++po.repv < n) {
				po.repn = true
				s2 = s.rep_p	// left repeat
				continue
			}
			po.repn = false
			po.repv = 1
		}
		if (s.bar_type.slice(-1) == ':')	// left repeat
			po.repv = 1
		if (s.rep_s) {			// variant
			s2 = s.rep_s[po.repv]	// next variant
			if (s2) {
				if (s2.rep_p			// same left repeat?
				 && s2.rep_p != po.repp) {
					po.repv = 1
					po.repp = s2.rep_p	// no, update
					s2 = s.rep_s[po.repv]
				}
				po.repn = false
				if (s2 != s)
					continue
				s2 = null
			} else {		// end of variants
				s2 = var_end(s)
				continue
			}
		}
		do {
			s = s.ts_next		// eat the next bars
		} while (s && !s.seqst)
	}
	po.s_cur = s

	// delay before next sound generation
	po.timouts.push(setTimeout(play_cont,
				(t - now) * 1000
					- 300,	// wake before end of playing
				po))
    } // play_cont()

    // search the index in the parts
    function get_part(po) {
    var	s, i, s_p
	for (s = po.s_cur; s; s = s.ts_prev) {
		if (s.parts) {
			po.i_p = -1
			po.ps = s.p_s
			return
		}

		// if a variant, set the repeat number and repeat start
		if (s.bar_type) {
			if (s.text && po.repv == 1) {
				i = parseInt(s.text)
				if (i)
					po.repv = i
			}
			if (s.rep_p)
				po.repp ??= s.rep_p
		}

		s_p = s.part1
		if (!s_p || !s_p.p_s)
			continue
		for (i = 0; i < s_p.p_s.length; i++) {
			if (s_p.p_s[i] == s) {
				po.i_p = i - (po.s_cur == s ? 1 : 0)
						// index in the parts
				po.ps = s_p.p_s	// array of pointers to P:
				return
			}
		}
	}
    } // get_part()

    // --- play_next ---
	if (po.stop) {
		if (po.onend)
			po.onend(po.repv)
		return
	}

	if (!po.repv)
		po.repv = 1
	get_part(po)

	po.stim = po.get_time(po) + .3	// start time + 0.3s
			- po.s_cur.ptim / po.conf.speed
	po.p_v = []			// voice table for the MIDI controls

	play_cont(po)			// start playing
} // play_next()

// nodejs
if (typeof module == 'object' && typeof exports == 'object')
	exports.ToAudio = ToAudio
// sndaud.js - audio output using HTML5 audio
//
// Copyright (C) 2019-2026 Jean-Francois Moine
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

// Audio5 creation

// @conf: configuration object - all items are optional:
//	ac: audio context - (default: created on play start)
//	sfu: soundfont URL (sf2 base64 encoded - default: "Scc1t2")
//	onend: callback function called at end of playing
//		Argument:
//			repv: last repeat variant number
//	onnote: callback function called on note start/stop playing
//		Arguments:
//			i: start index of the note in the ABC source
//			on: true on note start, false on note stop
//	errmsg: function called on error (default: alert)
//		Arguments:
//			error message
//
//  When playing, the following items must/may be set:
//	gain: (mandatory) volume, must be set to [0..1]
//	speed: (mandatory) must be set to 1
//	new_speed: (optional) new speed value

// Audio5 methods

// get_outputs() - get the output devices
//	return ['sf2'] or null
//
// play() - start playing
// @start -
// @stop: start and stop music symbols
// @level: repeat variant (optional, default = 0)
//
// stop() - stop playing
//
// set_vol() - set the current sound volume
// @volume: range [0..1] - undefined = return current value

    var	abcsf2 = []			// SF2 instruments

function Audio5(i_conf) {
    var	po,			// play object
	conf = i_conf,		// configuration
	empty = function() {},
	errmsg,
	ac,			// audio context
	gain,			// global gain
	model,			// device model (for iPad|iPhone|iPod)

	// instruments/notes
	parser,			// SF2 parser
	presets,		// array of presets
	instr = [],		// [voice] bank + instrument
	params = [],		// [instr][key] note parameters per instrument
	rates = [],		// [instr][key] playback rates
	w_instr = 0		// number of instruments being loaded

	// base64 stuff
    var b64d = []
	function init_b64d() {
	    var	b64l = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
		l = b64l.length
		for (var i = 0; i < l; i++)
			b64d[b64l[i]] = i
		b64d['='] = 0
	}
	function b64dcod(s) {
	    var	i, t, dl, a,
		l = s.length,
		j = 0

		dl = l * 3 / 4			// destination length
		if (s[l - 1] == '=') {
			if (s[l - 2] == '=')
				dl--
			dl--
			l -= 4
		}
		a = new Uint8Array(dl)
		for (i = 0; i < l; i += 4) {
			t =	(b64d[s[i]] << 18) +
				(b64d[s[i + 1]] << 12) +
				(b64d[s[i + 2]] << 6) +
				 b64d[s[i + 3]]
			a[j++] = (t >> 16) & 0xff
			a[j++] = (t >> 8) & 0xff
			a[j++] = t & 0xff
		}
		if (l != s.length) {
			t =	(b64d[s[i]] << 18) +
				(b64d[s[i + 1]] << 12) +
				(b64d[s[i + 2]] << 6) +
				 b64d[s[i + 3]]
			a[j++] = (t >> 16) & 0xff
			if (j < dl)
				a[j++] = (t >> 8) & 0xff
		}
		return a
	}

	// copy a sf2 sample to an audio buffer
	// @b = audio buffer (array of [-1..1])
	// @s = sf2 sample (PCM 16 bits)
	function sample_cp(b, s) {
	    var	i, n,
		a = b.getChannelData(0)		// destination = array of float32

		for (i = 0; i < s.length; i++)
			a[i] = s[i] / 196608	// volume divided by 6
	}

	// create all notes of an instrument
	function sf2_create(instr, sf2par, sf2pre) {	// parser, presets

		// get the instrument parameters
		// adapted from getInstruments() in sf2-parser.js
		function get_instr(i) {
		    var	generator,
			instrument = sf2par.instrument,
			zone = sf2par.instrumentZone,
			j = instrument[i].instrumentBagIndex,
			jl = instrument[i + 1]
				? instrument[i + 1].instrumentBagIndex
				: zone.length,
			info = []

			while (j < jl) {
				generator =
					sf2par.createInstrumentGenerator_(zone, j)
//				instrumentModulator =
//					sf2par.createInstrumentModulator_(zone, j)

				info.push({
					generator: generator.generator,
//					modulator: instrumentModulator.modulator
				})
				j++
			}
		return {
//			name: instrument[i].instrumentName,
			info: info
		}
	} // get_instr()

	// sf2_create
	    var i, j, k, sid, gen, parm, sample, infos,
		sample_hdr, scale, tune,
		gparm = {			// default parameters
			attack: .01,
			hold: .01,
			decay: .01,
//			sustain: 0,
			release: .01,
		},
		b = instr >> 7,			// bank
		p = instr % 128,		// preset
		pr = sf2pre

		rates[instr] = []

		// search the bank:preset
		for (i = 0; i < pr.length; i++) {
			gen = pr[i].header
			if (gen.preset == p
			 && gen.bank == b)
				break
		}
		pr = pr[i]
		if (!pr) {
			errmsg('unknown instrument ' + b + ':' + p)
			return			// unknown preset!
		}
		pr = pr.info			// list of gen/mod
		for (k = 0; k < pr.length; k++) {
		    gen = pr[k].generator
//fixme: there may be generator definitions here
//fixme: what when many instruments?
		    if (!gen.instrument)
			continue
		    if (gen.velRange?.lo > 1)
			continue		// ignore loud samples

		    infos = get_instr(gen.instrument.amount).info
		    for (i = 0; i < infos.length; i++) {
			gen = infos[i].generator

			// check if already a generator for this key range
			j = gen.keyRange.lo
			parm = {}

			if (gen.attackVolEnv)
				parm.attack = Math.pow(2,
						gen.attackVolEnv.amount / 1200)
			if (gen.holdVolEnv)
				parm.hold = Math.pow(2,
						gen.holdVolEnv.amount / 1200)
			if (gen.decayVolEnv)
				parm.decay = Math.pow(2,
						gen.decayVolEnv.amount / 1200)
			if (gen.sustainVolEnv)
				parm.sustain = gen.sustainVolEnv.amount / 10	// in dB
			if (gen.releaseVolEnv)
				parm.release = Math.pow(2,
						gen.releaseVolEnv.amount / 1200)
			if (gen.initialAttenuation)
				parm.atte = gen.initialAttenuation / 10		// in dB

		    if (gen.sampleID) {
			sid = gen.sampleID.amount
			sample_hdr = sf2par.sampleHeader[sid]
			if (sample_hdr.sampleType == 2)		// if stereo left
				continue
			sample = sf2par.sample[sid]
			parm.buffer = ac.createBuffer(1,
						sample.length,
						sample_hdr.sampleRate)

			sample_cp(parm.buffer, sample)

			if (gen.sampleModes?.amount & 1) {	// sample loop?
				parm.sm = 1
				parm.loopStart =
					(sample_hdr.startLoop
					 + (gen.startloopAddrsOffset?.amount || 0))
						/ sample_hdr.sampleRate
				parm.loopEnd =
					(sample_hdr.endLoop
					 + (gen.endloopAddrsOffset?.amount || 0))
						/ sample_hdr.sampleRate
			}

			// define the notes
			scale = (gen.scaleTuning ?
					gen.scaleTuning.amount : 100) / 100,
			tune = (gen.coarseTune ? gen.coarseTune.amount : 0) +
				(gen.fineTune ? gen.fineTune.amount : 0) / 100 +
				sample_hdr.pitchCorrection / 100 -
				(gen.overridingRootKey ?
					gen.overridingRootKey.amount :
					sample_hdr.originalPitch)
		    }

			for (j = gen.keyRange.lo; j <= gen.keyRange.hi; j++) {
				if (params[instr][j]?.buffer)
					continue		// use the first sample
			    if (gen.sampleID)
				rates[instr][j] = Math.pow(Math.pow(2, 1 / 12),
							(j + tune) * scale)
				if (!params[instr][j])
					params[instr][j] = {...gparm}
				Object.assign(params[instr][j], parm)
			}
		    }
		}
	} // sf2_create()

	// load an instrument (.js file)
	function load_instr(instr) {
		w_instr++
		abc2svg.loadjs(conf.sfu + '/' + instr + '.js',
			function() {
			    var	sf2par = new sf2.Parser(b64dcod(abcsf2[instr]))
				sf2par.parse()
			    var	sf2pre = sf2par.getPresets()
				sf2_create(instr, sf2par, sf2pre)

				if (--w_instr == 0)
					play_start()
			},
			function() {
				errmsg('could not find the instrument ' +
					((instr / 128) | 0).toString() + '-' +
					(instr % 128).toString())
				if (--w_instr == 0)
					play_start()
			})
	} // load_instr()

	// define the instruments of the tune
	function def_instr(s, f, sf2par, sf2pre) {
	    var	i,
		bk = [],		// bank number per voice
		nv = -1,		// highest voice number
		vb = 0			// bitmap of voices with instruments

		// scan from the beginning of the tune
		s = s.p_v.sym
		while (s.ts_prev)
			s = s.ts_prev

		for ( ; s; s = s.ts_next) {
			if (s.v > nv) {			// if new voice
				nv = s.v
				bk[nv] = 0		// bank 0
				if (s.p_v.midictl) {
					if (s.p_v.midictl[0])	// MSB
						bk[s.v] = (bk[s.v] & ~0x1fc000)
								+ (s.p_v.midictl[0] << 14)
					if (s.p_v.midictl[32])	// LSB
						bk[s.v] = (bk[s.v] & ~0x3f80)
								+ (s.p_v.midictl[32] << 7)
				}
			}
			switch (s.subtype) {
			case "midiprog":
				break
			case "midictl":
				if (s.ctrl != 0 && s.ctrl != 32)
					continue	// not bank LSB or MSB
				if (bk[s.v] == undefined)
					bk[s.v] = 0
				if (s.ctrl == 0)			// MSB
					bk[s.v] = (bk[s.v] & ~0x1fc000)
							+ (s.val << 14)
				else					// LSB
					bk[s.v] = (bk[s.v] & ~0x3f80)
							+ (s.val << 7)
//				continue
			default:
				continue
			}
			vb |= 1 << s.v
			i = s.instr
			if (i == undefined) {		// channel only
				if (s.chn != 9)
					continue
				i = bk[s.v] ? 0 : 128 * 128	// bank 256 program 0
			}
			if (bk[s.v]) 
				i += bk[s.v]		// bank number
			if (!params[i]) {
				params[i] = []		// instrument being loaded
				f(i, sf2par, sf2pre)	// sf2_create or load_instr
			}
		}
		nv = (2 << nv) - 1
		if (nv != vb			// if some voice(s) without instrument
		 && !params[0]) {
			params[0] = []		// load the piano
			f(0, sf2par, sf2pre)
		}
	} // def_instr()

	// load the needed instruments
	function load_res(s) {
	    if (abc2svg.sf2
	     || conf.sfu.slice(-4) == ".sf2"
	     || conf.sfu.slice(-3) == ".js") {

		// if the soundfont is loaded as .js
		if (abc2svg.sf2) {
			if (!parser) {
				parser = new sf2.Parser(b64dcod(abc2svg.sf2))
				parser.parse()
				presets = parser.getPresets()
			}

		// load the soundfont if not done yet
		} else if (!parser) {
		    w_instr++
		    if (conf.sfu.slice(-3) == ".js") {
			abc2svg.loadjs(conf.sfu,
				function() {
					load_res(s)	// load the instruments
					if (--w_instr == 0)
						play_start()
				},
				function() {
					errmsg('could not load the sound file '
						+ conf.sfu)
					if (--w_instr == 0)
						play_start()
				})
			return
		    }
		    var	r = new XMLHttpRequest()	// .sf2
			r.open('GET', conf.sfu, true)
			r.responseType = "arraybuffer"
			r.onload = function() {
				if (r.status === 200) {
					parser = new sf2.Parser(
							new Uint8Array(r.response))
					parser.parse()
					presets = parser.getPresets()
					load_res(s)	// load the instruments
					if (--w_instr == 0)
						play_start()
				} else {
					errmsg('could not load the sound file '
						+ conf.sfu)
					if (--w_instr == 0)
						play_start()
				}
			}
			r.onerror = function() {
					errmsg('could not load the sound file '
						+ conf.sfu)
				if (--w_instr == 0)
					play_start()
			}
			r.send()
			return
		}

		// create the instruments and start playing
		def_instr(s, sf2_create, parser, presets)
	    } else {

	// (case instruments as base64 encoded js file,
	//  one file per instrument)
		def_instr(s, load_instr)
	    }
	} // load_res()

	// return the play real time in seconds
	function get_time(po) {
		return po.ac.currentTime
	} // get_time()

	// MIDI control
	function midi_ctrl(po, s, t) {
		switch (s.ctrl) {
		case 0:				// bank MSB
			if (po.v_b[s.v] == undefined)
				po.v_b[s.v] = 0
			po.v_b[s.v] = (po.v_b[s.v] & ~0x1fc000)
					+ (s.val << 14)
			break
		case 7:				// volume
			s.p_v.vol = s.val / 127
			break
		case 10:			// pan
			s.p_v.pan = s.val / 63.5 - 1
					// ((0) -1: left, (127) 1:right, (64) 0)
			break
		case 32:			// bank LSB
			if (po.v_b[s.v] == undefined)
				po.v_b[s.v] = 0
			po.v_b[s.v] = (po.v_b[s.v] & ~0x3f80)
					+ (s.val << 7)
			break
		}
	} // midi_ctrl()

	// MIDI prog or channel
	function midi_prog(po, s) {
	    var	i = s.instr

		po.v_c[s.v] = s.chn
		if (i == undefined) {
			if (s.chn != 9)			// if not channel 9
				return
			i = po.v_b[s.v] ? 0 : 128 * 128	// bank 256 program 0
		}
		if (po.v_b[s.v])
			i += po.v_b[s.v]
		po.c_i[s.chn] = i
	} // midi_prog()

	// create a note
	// @po = play object
	// @s = symbol
	// @key = MIDI key + detune
	// @t = audio start time
	// @d = duration adjusted for speed
	function note_run(po, s, key, t, d) {
	    var	g, st,
		t2 = t,
		c = po.v_c[s.v],
		instr = po.c_i[c],
		k = key | 0,
		parm = params[instr][k],
		o = po.ac.createBufferSource(),
		v = s.p_v.vol == undefined ? .7 : s.p_v.vol	// volume (gain)

		if (!v			// mute voice
		 || !parm)		// if the instrument could not be loaded
			return		// or if it has not this key
		o.buffer = parm.buffer
		if (parm.sm) {
			o.loop = true
			o.loopStart = parm.loopStart
			o.loopEnd = parm.loopEnd
		}
		if (o.detune) {
		    var	dt = (key * 100) % 100
			if (dt)			// if micro-tone
				 o.detune.value = dt
		}
//		o.playbackRate.setValueAtTime(parm.rate, ac.currentTime)
		o.playbackRate.value = po.rates[instr][k]

		g = po.ac.createGain()

		if (parm.atte)			// if initial attenuation
			v /= Math.pow(10, parm.atte / 20)
		if (parm.hold <= .01) {
			g.gain.setValueAtTime(v, t)
		} else {
			if (parm.attack <= .01) {
				g.gain.setValueAtTime(v, t)
			} else {
				g.gain.setValueAtTime(.01, t)
				t2 += parm.attack
				g.gain.linearRampToValueAtTime(v, t2)
			}
			t2 += parm.hold
			g.gain.setValueAtTime(v, t2)
		}

		if (parm.sustain && parm.decay > .01) {
			v = parm.sustain == 100
				? .01			// 100dB -> full attenuation
				: v / Math.pow(10, parm.sustain / 20)
			g.gain.exponentialRampToValueAtTime(v, t2 + parm.decay)
		}

		g.gain.setValueAtTime(v, t + d)
		g.gain.linearRampToValueAtTime(.01, t + d + parm.release)

		if (s.p_v.pan != undefined) {	// (control 10)
		    var	p = po.ac.createStereoPanner()
			p.pan.value = s.p_v.pan
					
			o.connect(p)
			p.connect(g)
		} else {
			o.connect(g)
		}
		g.connect(po.gain)

		// start the note
		o.start(t)
		o.stop(t + d + parm.release)
	} // note_run()

	// wait for all resources, then start playing
	function play_start() {
		if (po.stop) {			// stop playing
			po.onend(repv)
			return
		}

		// all resources are there
		gain.connect(ac.destination)
		abc2svg.play_next(po)
	} // play_start()

	// Audio5 function

	init_b64d()			// initialize base64 decoding

	if (!conf.sfu)
		conf.sfu = "Scc1t2"	// set the default soundfont location

	// get the device model
	if (navigator.userAgentData
	 && navigator.userAgentData.getHighEntropyValues)
		navigator.userAgentData.getHighEntropyValues(['model'])
			.then(function(ua) {
				model = ua.model
			})
	else
		model = navigator.userAgent

    // public methods
    return {

	// get outputs
	get_outputs: function() {
		return (window.AudioContext || window.webkitAudioContext) ?
				['sf2'] : null
	}, // get_outputs()

	// play the symbols
	play: function(i_start, i_end, i_lvl, i_loop) {

		// get the callback functions
		errmsg = conf.errmsg || alert

		// play a null file to unlock the iOS audio
		// This is needed for iPhone/iPad/...
		function play_unlock() {
		    var buf = ac.createBuffer(1, 1, 22050),
			src = ac.createBufferSource()

			src.buffer = buf
			src.connect(ac.destination)
			src.start(0)
		}

		// initialize the audio subsystem if not done yet
		if (!gain) {
			ac = conf.ac
			if (!ac) {
				conf.ac = ac = new (window.AudioContext ||
							window.webkitAudioContext)
// Ensure the AudioContext is running and unlocked from the click handler. 
// Some platforms/browsers keep the context suspended unless a buffer is started 
// immediately from a user gesture; this can surface as "no sound" when the first 
// note is scheduled later (e.g. slow practice playback). 
				if (ac.state === "suspended")
					ac.resume()
// iOS explicitly needs an unlock buffer; on other platforms this is harmless and 
// improves reliability when tempo is very slow. 
				play_unlock()
			}
			gain = ac.createGain()
			gain.gain.value = conf.gain ?? .7
		}

		while (i_start.noplay)
			i_start = i_start.ts_next
		po = {
			conf: conf,	// configuration
			onend: conf.onend || empty,
			onnote: conf.onnote || empty,
//			stop: false,	// stop playing
			s_end: i_end,	// last music symbol / null
			s_cur: i_start,	// current music symbol
//			repn: false,	// don't repeat
			repv: i_lvl || 0, // repeat variant number
			tgen: 2,	// // generate by 2 seconds
			get_time: get_time,
			midi_ctrl: midi_ctrl,
			midi_prog: midi_prog,
			note_run: note_run,
			timouts: [],
			v_c: [],	// voice to channel
			c_i: [],	// channel to instrument
			v_b: [],	// voice to bank

			// audio specific
			ac: ac,
			gain: gain,
			rates: rates
		}
		if (i_loop)
			po.s_loop = i_start

		w_instr++			// play lock
		load_res(i_start)
		if (--w_instr == 0)		// all resources are there
			play_start()
	}, // play()

	// stop playing
	stop: function() {
		po.stop = true
		po.timouts.forEach(function(id) {
					clearTimeout(id)
				})
		abc2svg.play_next(po)
		if (gain) {
			gain.disconnect()
			gain = null
		}
	}, // stop()

	// set volume
	set_vol: function(v) {
		if (gain)
			gain.gain.value = v
	} // set_vol()
    } // returned object
} // Audio5()
/*! JavaScript SoundFont 2 Parser. Copyright 2013-2015 imaya/GREE Inc and Colin Clark. Licensed under the MIT License. */
// https://github.com/colinbdclark/sf2-parser
/*
 * JavaScript SoundFont 2 Parser
 *
 * Copyright 2013 imaya/GREE Inc
 * Copyright 2015 Colin Clark
 *
 * Based on code from the "SoundFont Synthesizer for WebMidiLink"
 *   https://github.com/gree/sf2synth.js
 *
 * Adapted to abc2svg
 * Copyright (C) 2018-2021 Jean-Francois Moine
 *
 * Licensed under the MIT License.
 */

/*global require*/

(function (root, factory) {
    if (typeof exports === "object") {
        // We're in a CommonJS-style loader.
        root.sf2 = exports;
        factory(exports);
    } else if (typeof define === "function" && define.amd) {
        // We're in an AMD-style loader.
        define(["exports"], function (exports) {
            root.sf2 = exports;
            return (root.sf2, factory(exports));
        });
    } else {
        // Plain old browser.
        root.sf2 = {};
        factory(root.sf2);
    }
}(this, function (sf2) {		// exports
    "use strict";

    sf2.Parser = function (input, options) {
      options = options || {};
      /** @type {ByteArray} */
      this.input = input;
      /** @type {(Object|undefined)} */
      this.parserOptions = options.parserOptions;

      /** @type {Array.<Object>} */
      // this.presetHeader;
      /** @type {Array.<Object>} */
      // this.presetZone;
      /** @type {Array.<Object>} */
      // this.presetZoneModulator;
      /** @type {Array.<Object>} */
      // this.presetZoneGenerator;
      /** @type {Array.<Object>} */
      // this.instrument;
      /** @type {Array.<Object>} */
      // this.instrumentZone;
      /** @type {Array.<Object>} */
      // this.instrumentZoneModulator;
      /** @type {Array.<Object>} */
      // this.instrumentZoneGenerator;
      /** @type {Array.<Object>} */
      //this.sampleHeader;
    };

    sf2.Parser.prototype.parse = function () {
      /** @type {sf2.Riff.Parser} */
      var parser = new sf2.Riff.Parser(this.input, this.parserOptions),
      /** @type {?sf2.Riff.Chunk} */
	  chunk;

      // parse RIFF chunk
      parser.parse();
      if (parser.chunkList.length !== 1)
        throw new Error('wrong chunk length');

      chunk = parser.getChunk(0);
      if (chunk === null)
        throw new Error('chunk not found');

      this.parseRiffChunk(chunk);

      // TODO: Presumably this is here to reduce memory,
      // but does it really matter? Shouldn't we always be
      // referencing the underlying ArrayBuffer and thus
      // it will persist, in which case why delete it?
      this.input = null;
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseRiffChunk = function (chunk) {
      /** @type {sf2.Riff.Parser} */
      var parser,
      /** @type {ByteArray} */
	  data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {string} */
	  signature;

      // check parse target
      if (chunk.type !== 'RIFF')
        throw new Error('invalid chunk type:' + chunk.type);

      // check signature
      signature = String.fromCharCode(data[ip++], data[ip++], data[ip++], data[ip++]);
      if (signature !== 'sfbk')
        throw new Error('invalid signature:' + signature);

      // read structure
      parser = new sf2.Riff.Parser(data, {'index': ip, 'length': chunk.size - 4});
      parser.parse();
      if (parser.getNumberOfChunks() !== 3)
        throw new Error('invalid sfbk structure');

      // INFO-list
      this.parseInfoList(/** @type {!sf2.Riff.Chunk} */parser.getChunk(0));

      // sdta-list
      this.parseSdtaList(/** @type {!sf2.Riff.Chunk} */parser.getChunk(1));

      // pdta-list
      this.parsePdtaList(/** @type {!sf2.Riff.Chunk} */parser.getChunk(2));
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseInfoList = function (chunk) {
      /** @type {sf2.Riff.Parser} */
      var parser,
      /** @type {ByteArray} */
	  data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {string} */
	  signature;

      // check parse target
      if (chunk.type !== 'LIST')
        throw new Error('invalid chunk type:' + chunk.type);

      // check signature
      signature = String.fromCharCode(data[ip++], data[ip++], data[ip++], data[ip++]);
      if (signature !== 'INFO')
        throw new Error('invalid signature:' + signature);

      // read structure
      parser = new sf2.Riff.Parser(data, {'index': ip, 'length': chunk.size - 4});
      parser.parse();
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseSdtaList = function (chunk) {
      /** @type {sf2.Riff.Parser} */
      var parser,
      /** @type {ByteArray} */
	  data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {string} */
	  signature;

      // check parse target
      if (chunk.type !== 'LIST')
        throw new Error('invalid chunk type:' + chunk.type);

      // check signature
      signature = String.fromCharCode(data[ip++], data[ip++], data[ip++], data[ip++]);
      if (signature !== 'sdta')
        throw new Error('invalid signature:' + signature);

      // read structure
      parser = new sf2.Riff.Parser(data, {'index': ip, 'length': chunk.size - 4});
      parser.parse();
      if (parser.chunkList.length !== 1)
        throw new Error('TODO');
      this.samplingData =
        /** @type {{type: string, size: number, offset: number}} */
	  parser.getChunk(0);
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parsePdtaList = function (chunk) {
      /** @type {sf2.Riff.Parser} */
      var parser,
      /** @type {ByteArray} */
	  data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {string} */
	  signature;

      // check parse target
      if (chunk.type !== 'LIST')
        throw new Error('invalid chunk type:' + chunk.type);

      // check signature
      signature = String.fromCharCode(data[ip++], data[ip++], data[ip++], data[ip++]);
      if (signature !== 'pdta')
        throw new Error('invalid signature:' + signature);

      // read structure
      parser = new sf2.Riff.Parser(data, {'index': ip, 'length': chunk.size - 4});
      parser.parse();

      // check number of chunks
      if (parser.getNumberOfChunks() !== 9)
        throw new Error('invalid pdta chunk');

      this.parsePhdr(/** @type {sf2.Riff.Chunk} */(parser.getChunk(0)));
      this.parsePbag(/** @type {sf2.Riff.Chunk} */(parser.getChunk(1)));
      this.parsePmod(/** @type {sf2.Riff.Chunk} */(parser.getChunk(2)));
      this.parsePgen(/** @type {sf2.Riff.Chunk} */(parser.getChunk(3)));
      this.parseInst(/** @type {sf2.Riff.Chunk} */(parser.getChunk(4)));
      this.parseIbag(/** @type {sf2.Riff.Chunk} */(parser.getChunk(5)));
      this.parseImod(/** @type {sf2.Riff.Chunk} */(parser.getChunk(6)));
      this.parseIgen(/** @type {sf2.Riff.Chunk} */(parser.getChunk(7)));
      this.parseShdr(/** @type {sf2.Riff.Chunk} */(parser.getChunk(8)));
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parsePhdr = function (chunk) {
      /** @type {ByteArray} */
      var data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {Array.<Object>} */
	  presetHeader = this.presetHeader = [],
      /** @type {number} */
	  size = chunk.offset + chunk.size;

      // check parse target
      if (chunk.type !== 'phdr')
        throw new Error('invalid chunk type:' + chunk.type);

      while (ip < size) {
        presetHeader.push({
          presetName: String.fromCharCode.apply(null, data.subarray(ip, ip += 20)),
          preset: data[ip++] | (data[ip++] << 8),
          bank: data[ip++] | (data[ip++] << 8),
          presetBagIndex: data[ip++] | (data[ip++] << 8),
          library: (data[ip++] | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24)) >>> 0,
          genre: (data[ip++] | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24)) >>> 0,
          morphology: (data[ip++] | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24)) >>> 0
        });
      }
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parsePbag = function (chunk) {
      /** @type {ByteArray} */
      var data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {Array.<Object>} */
	  presetZone = this.presetZone = [],
      /** @type {number} */
	  size = chunk.offset + chunk.size;

      // check parse target
      if (chunk.type !== 'pbag')
        throw new Error('invalid chunk type:'  + chunk.type);

      while (ip < size) {
        presetZone.push({
          presetGeneratorIndex: data[ip++] | (data[ip++] << 8),
          presetModulatorIndex: data[ip++] | (data[ip++] << 8)
        });
      }
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parsePmod = function (chunk) {
      // check parse target
      if (chunk.type !== 'pmod')
        throw new Error('invalid chunk type:' + chunk.type);

      this.presetZoneModulator = this.parseModulator(chunk);
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parsePgen = function (chunk) {
      // check parse target
      if (chunk.type !== 'pgen')
        throw new Error('invalid chunk type:' + chunk.type);
      this.presetZoneGenerator = this.parseGenerator(chunk);
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseInst = function (chunk) {
      /** @type {ByteArray} */
      var data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {Array.<Object>} */
	  instrument = this.instrument = [],
      /** @type {number} */
	  size = chunk.offset + chunk.size;

      // check parse target
      if (chunk.type !== 'inst')
        throw new Error('invalid chunk type:' + chunk.type);

      while (ip < size) {
        instrument.push({
          instrumentName: String.fromCharCode.apply(null, data.subarray(ip, ip += 20)),
          instrumentBagIndex: data[ip++] | (data[ip++] << 8)
        });
      }
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseIbag = function (chunk) {
      /** @type {ByteArray} */
      var data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {Array.<Object>} */
	  instrumentZone = this.instrumentZone = [],
      /** @type {number} */
	  size = chunk.offset + chunk.size;

      // check parse target
      if (chunk.type !== 'ibag')
        throw new Error('invalid chunk type:' + chunk.type);

      while (ip < size) {
        instrumentZone.push({
          instrumentGeneratorIndex: data[ip++] | (data[ip++] << 8),
          instrumentModulatorIndex: data[ip++] | (data[ip++] << 8)
        });
      }
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseImod = function (chunk) {
      // check parse target
      if (chunk.type !== 'imod')
        throw new Error('invalid chunk type:' + chunk.type);

      this.instrumentZoneModulator = this.parseModulator(chunk);
    };


    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseIgen = function (chunk) {
      // check parse target
      if (chunk.type !== 'igen')
        throw new Error('invalid chunk type:' + chunk.type);

      this.instrumentZoneGenerator = this.parseGenerator(chunk);
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     */
    sf2.Parser.prototype.parseShdr = function (chunk) {
      /** @type {ByteArray} */
      var data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {Array.<Object>} */
	  samples = this.sample = [],
      /** @type {Array.<Object>} */
	  sampleHeader = this.sampleHeader = [],
      /** @type {number} */
	  size = chunk.offset + chunk.size,
      /** @type {string} */
	  sampleName,
      /** @type {number} */
	  start,
      /** @type {number} */
	  end,
      /** @type {number} */
	  startLoop,
      /** @type {number} */
	  endLoop,
      /** @type {number} */
	  sampleRate,
      /** @type {number} */
	  originalPitch,
      /** @type {number} */
	  pitchCorrection,
      /** @type {number} */
	  sampleLink,
      /** @type {number} */
	  sampleType;

      // check parse target
      if (chunk.type !== 'shdr')
        throw new Error('invalid chunk type:' + chunk.type);

      while (ip < size) {
        sampleName = String.fromCharCode.apply(null, data.subarray(ip, ip += 20));
        start =
          (data[ip++] << 0) | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24);
        end =
          (data[ip++] << 0) | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24);
        startLoop =
          (data[ip++] << 0) | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24);
        endLoop =
          (data[ip++] << 0) | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24);
        sampleRate =
          (data[ip++] << 0) | (data[ip++] << 8) | (data[ip++] << 16) | (data[ip++] << 24);
        originalPitch = data[ip++];
        pitchCorrection = (data[ip++] << 24) >> 24;
        sampleLink = data[ip++] | (data[ip++] << 8);
        sampleType = data[ip++] | (data[ip++] << 8);

        var sample = new Int16Array(new Uint8Array(data.subarray(
          this.samplingData.offset + start * 2,
          this.samplingData.offset + end   * 2
        )).buffer);

        startLoop -= start;
        endLoop -= start;

        if (sampleRate > 0) {
          var adjust = this.adjustSampleData(sample, sampleRate);
          sample = adjust.sample;
          sampleRate *= adjust.multiply;
          startLoop *= adjust.multiply;
          endLoop *= adjust.multiply;
        }

        samples.push(sample);

        sampleHeader.push({
          sampleName: sampleName,
          /*
          start: start,
          end: end,
          */
          startLoop: startLoop,
          endLoop: endLoop,
          sampleRate: sampleRate,
          originalPitch: originalPitch,
          pitchCorrection: pitchCorrection,
          sampleLink: sampleLink,
          sampleType: sampleType
        });
      }
    };

    // TODO: This function is questionable;
    // it doesn't interpolate the sample data
    // and always forces a sample rate of 22050 or higher. Why?
    sf2.Parser.prototype.adjustSampleData = function (sample, sampleRate) {
      /** @type {Int16Array} */
      var newSample,
      /** @type {number} */
	  i,
      /** @type {number} */
	  il,
      /** @type {number} */
	  j,
      /** @type {number} */
	  multiply = 1;

      // buffer
      while (sampleRate < 22050) {
        newSample = new Int16Array(sample.length * 2);
        for (i = j = 0, il = sample.length; i < il; ++i) {
          newSample[j++] = sample[i];
          newSample[j++] = sample[i];
        }
        sample = newSample;
        multiply *= 2;
        sampleRate *= 2;
      }

      return {
        sample: sample,
        multiply: multiply
      };
    };

    /**
     * @param {sf2.Riff.Chunk} chunk
     * @return {Array.<Object>}
     */
    sf2.Parser.prototype.parseModulator = function (chunk) {
        /** @type {ByteArray} */
        var data = this.input,
        /** @type {number} */
	    ip = chunk.offset,
        /** @type {number} */
	    size = chunk.offset + chunk.size,
        /** @type {number} */
	    code,
        /** @type {string} */
	    key,
        /** @type {Array.<Object>} */
	    output = [];

        while (ip < size) {
          // Src  Oper
          // TODO
          ip += 2;

          // Dest Oper
          code = data[ip++] | (data[ip++] << 8);
          key = sf2.Parser.GeneratorEnumeratorTable[code];
          if (key === undefined) {
            // Amount
            output.push({
              type: key,
              value: {
                code: code,
                amount: data[ip] | (data[ip+1] << 8) << 16 >> 16,
                lo: data[ip++],
                hi: data[ip++]
              }
            });
          } else {
            // Amount
            switch (key) {
              case 'keyRange': /* FALLTHROUGH */
              case 'velRange': /* FALLTHROUGH */
              case 'keynum': /* FALLTHROUGH */
              case 'velocity':
                output.push({
                  type: key,
                  value: {
                    lo: data[ip++],
                    hi: data[ip++]
                  }
                });
                break;
              default:
                output.push({
                  type: key,
                  value: {
                    amount: data[ip++] | (data[ip++] << 8) << 16 >> 16
                  }
                });
                break;
            }
          }

          // AmtSrcOper
          // TODO
          ip += 2;

          // Trans Oper
          // TODO
          ip += 2;
        }

        return output;
      };

    /**
     * @param {sf2.Riff.Chunk} chunk
     * @return {Array.<Object>}
     */
    sf2.Parser.prototype.parseGenerator = function (chunk) {
      /** @type {ByteArray} */
      var data = this.input,
      /** @type {number} */
	  ip = chunk.offset,
      /** @type {number} */
	  size = chunk.offset + chunk.size,
      /** @type {number} */
	  code,
      /** @type {string} */
	  key,
      /** @type {Array.<Object>} */
	  output = [];

      while (ip < size) {
        code = data[ip++] | (data[ip++] << 8);
        key = sf2.Parser.GeneratorEnumeratorTable[code];
        if (key === undefined) {
          output.push({
            type: key,
            value: {
              code: code,
              amount: data[ip] | (data[ip+1] << 8) << 16 >> 16,
              lo: data[ip++],
              hi: data[ip++]
            }
          });
          continue;
        }

        switch (key) {
          case 'keynum': /* FALLTHROUGH */
          case 'keyRange': /* FALLTHROUGH */
          case 'velRange': /* FALLTHROUGH */
          case 'velocity':
            output.push({
              type: key,
              value: {
                lo: data[ip++],
                hi: data[ip++]
              }
            });
            break;
          default:
            output.push({
              type: key,
              value: {
                amount: data[ip++] | (data[ip++] << 8) << 16 >> 16
              }
            });
            break;
        }
      }

      return output;
    };

//    sf2.Parser.prototype.getInstruments = function () {
//      /** @type {Array.<Object>} */
//      var instrument = this.instrument,
//      /** @type {Array.<Object>} */
//	  zone = this.instrumentZone,
//      /** @type {Array.<Object>} */
//	  output = [],
//      /** @type {number} */
//	  bagIndex,
//      /** @type {number} */
//	  bagIndexEnd,
//      /** @type {Array.<Object>} */
//	  zoneInfo,
//      /** @type {{generator: Object, generatorInfo: Array.<Object>}} */
//	  instrumentGenerator,
//      /** @type {{modulator: Object, modulatorInfo: Array.<Object>}} */
//	  instrumentModulator,
//      /** @type {number} */
//	  i,
//      /** @type {number} */
//	  il,
//      /** @type {number} */
//	  j,
//      /** @type {number} */
//	  jl;
//
//      // instrument -> instrument bag -> generator / modulator
//      for (i = 0, il = instrument.length; i < il; ++i) {
//        bagIndex    = instrument[i].instrumentBagIndex;
//        bagIndexEnd = instrument[i+1] ? instrument[i+1].instrumentBagIndex : zone.length;
//        zoneInfo = [];
//
//        // instrument bag
//        for (j = bagIndex, jl = bagIndexEnd; j < jl; ++j) {
//          instrumentGenerator = this.createInstrumentGenerator_(zone, j);
//          instrumentModulator = this.createInstrumentModulator_(zone, j);
//
//          zoneInfo.push({
//            generator: instrumentGenerator.generator,
//            modulator: instrumentModulator.modulator,
//          });
//        }
//
//        output.push({
//          name: instrument[i].instrumentName,
//          info: zoneInfo
//        });
//      }
//
//      return output;
//    };

    sf2.Parser.prototype.getPresets = function () {
      /** @type {Array.<Object>} */
      var preset   = this.presetHeader,
      /** @type {Array.<Object>} */
	  zone = this.presetZone,
      /** @type {Array.<Object>} */
	  output = [],
      /** @type {number} */
	  bagIndex,
      /** @type {number} */
	  bagIndexEnd,
      /** @type {Array.<Object>} */
	  zoneInfo,
      /** @type {number} */
//	  instrument,
      /** @type {{generator: Object, generatorInfo: Array.<Object>}} */
	  presetGenerator,
      /** @type {{modulator: Object, modulatorInfo: Array.<Object>}} */
	  presetModulator,
      /** @type {number} */
	  i,
      /** @type {number} */
	  il,
      /** @type {number} */
	  j,
      /** @type {number} */
	  jl

      // preset -> preset bag -> generator / modulator
      for (i = 0, il = preset.length; i < il; ++i) {
//        bagIndex    = preset[i].presetBagIndex;
	j = preset[i].presetBagIndex
//        bagIndexEnd = preset[i+1] ? preset[i+1].presetBagIndex : zone.length;
	jl = preset[i+1] ? preset[i+1].presetBagIndex : zone.length
        zoneInfo = [];

        // preset bag
//        for (j = bagIndex, jl = bagIndexEnd; j < jl; ++j) {
        for ( ; j < jl; ++j) {
          presetGenerator = this.createPresetGenerator_(zone, j);
          presetModulator = this.createPresetModulator_(zone, j);

          zoneInfo.push({
            generator: presetGenerator.generator,
//            generatorSequence: presetGenerator.generatorInfo,
            modulator: presetModulator.modulator,
//            modulatorSequence: presetModulator.modulatorInfo
          });

//          instrument =
//            presetGenerator.generator.instrument !== undefined ?
//              presetGenerator.generator.instrument.amount :
//            presetModulator.modulator.instrument !== undefined ?
//              presetModulator.modulator.instrument.amount :
//            null;
        }

        output.push({
//          name: preset[i].presetName,
          info: zoneInfo,
          header: preset[i],
//          instrument: instrument
        });
      }

      return output;
    };

    /**
     * @param {Array.<Object>} zone
     * @param {number} index
     * @returns {{generator: Object, generatorInfo: Array.<Object>}}
     * @private
     */
    sf2.Parser.prototype.createInstrumentGenerator_ = function (zone, index) {
      var modgen = this.createBagModGen_(
        zone,
        zone[index].instrumentGeneratorIndex,
        zone[index+1] ? zone[index+1].instrumentGeneratorIndex: this.instrumentZoneGenerator.length,
        this.instrumentZoneGenerator
      );

      return {
        generator: modgen.modgen,
      };
    };

    /**
     * @param {Array.<Object>} zone
     * @param {number} index
     * @returns {{modulator: Object, modulatorInfo: Array.<Object>}}
     * @private
     */
    sf2.Parser.prototype.createInstrumentModulator_ = function (zone, index) {
      var modgen = this.createBagModGen_(
        zone,
        zone[index].presetModulatorIndex,
        zone[index+1] ? zone[index+1].instrumentModulatorIndex: this.instrumentZoneModulator.length,
        this.instrumentZoneModulator
      );

      return {
        modulator: modgen.modgen
      };
    };

    /**
     * @param {Array.<Object>} zone
     * @param {number} index
     * @returns {{generator: Object, generatorInfo: Array.<Object>}}
     * @private
     */
    sf2.Parser.prototype.createPresetGenerator_ = function (zone, index) {
      var modgen = this.createBagModGen_(
        zone,
        zone[index].presetGeneratorIndex,
        zone[index+1] ? zone[index+1].presetGeneratorIndex : this.presetZoneGenerator.length,
        this.presetZoneGenerator
      );

      return {
        generator: modgen.modgen,
//        generatorInfo: modgen.modgenInfo
      };
    };

      /**
       * @param {Array.<Object>} zone
       * @param {number} index
       * @returns {{modulator: Object, modulatorInfo: Array.<Object>}}
       * @private
       */
    sf2.Parser.prototype.createPresetModulator_ = function (zone, index) {
      /** @type {{modgen: Object, modgenInfo: Array.<Object>}} */
      var modgen = this.createBagModGen_(
        zone,
        zone[index].presetModulatorIndex,
        zone[index+1] ? zone[index+1].presetModulatorIndex : this.presetZoneModulator.length,
        this.presetZoneModulator
      );

      return {
        modulator: modgen.modgen,
//        modulatorInfo: modgen.modgenInfo
      };
    };

    /**
     * @param {Array.<Object>} zone
     * @param {number} indexStart
     * @param {number} indexEnd
     * @param zoneModGen
     * @returns {{modgen: Object, modgenInfo: Array.<Object>}}
     * @private
     */
    sf2.Parser.prototype.createBagModGen_ = function (zone, indexStart, indexEnd, zoneModGen) {
      /** @type {Object} */
      var modgen = {
        unknown: [],
        'keyRange': {
          hi: 127,
          lo: 0
        }
      }; // TODO
      /** @type {Object} */
      var info,
      /** @type {number} */
	  i,
      /** @type {number} */
	  il;

      for (i = indexStart, il = indexEnd; i < il; ++i) {
        info = zoneModGen[i];

        if (info.type === 'unknown')
          modgen.unknown.push(info.value);
	else
          modgen[info.type] = info.value;
      }

      return {
        modgen: modgen
      };
    };


    /**
     * @type {Array.<string>}
     * @const
     */
    sf2.Parser.GeneratorEnumeratorTable = [
      'startAddrsOffset',
      'endAddrsOffset',
      'startloopAddrsOffset',
      'endloopAddrsOffset',
      'startAddrsCoarseOffset',
      'modLfoToPitch',
      'vibLfoToPitch',
      'modEnvToPitch',
      'initialFilterFc',
      'initialFilterQ',
      'modLfoToFilterFc',
      'modEnvToFilterFc',
      'endAddrsCoarseOffset',
      'modLfoToVolume',
      undefined, // 14
      'chorusEffectsSend',
      'reverbEffectsSend',
      'pan',
      undefined,
      undefined,
      undefined, // 18,19,20
      'delayModLFO',
      'freqModLFO',
      'delayVibLFO',
      'freqVibLFO',
      'delayModEnv',
      'attackModEnv',
      'holdModEnv',
      'decayModEnv',
      'sustainModEnv',
      'releaseModEnv',
      'keynumToModEnvHold',
      'keynumToModEnvDecay',
      'delayVolEnv',
      'attackVolEnv',
      'holdVolEnv',
      'decayVolEnv',
      'sustainVolEnv',
      'releaseVolEnv',
      'keynumToVolEnvHold',
      'keynumToVolEnvDecay',
      'instrument',
      undefined, // 42
      'keyRange',
      'velRange',
      'startloopAddrsCoarseOffset',
      'keynum',
      'velocity',
      'initialAttenuation',
      undefined, // 49
      'endloopAddrsCoarseOffset',
      'coarseTune',
      'fineTune',
      'sampleID',
      'sampleModes',
      undefined, // 55
      'scaleTuning',
      'exclusiveClass',
      'overridingRootKey'
    ];

    sf2.Riff = {};

    sf2.Riff.Parser = function (input, options) {
      options = options || {};
      /** @type {ByteArray} */
      this.input = input;
      /** @type {number} */
      this.ip = options.index || 0;
      /** @type {number} */
      this.length = options.length || input.length - this.ip;
      /** @type {Array.<sf2.Riff.Chunk>} */
    //   this.chunkList;
      /** @type {number} */
      this.offset = this.ip;
      /** @type {boolean} */
      this.padding = options.padding !== undefined ? options.padding : true;
      /** @type {boolean} */
      this.bigEndian = options.bigEndian !== undefined ? options.bigEndian : false;
    };

    /**
     * @param {string} type
     * @param {number} size
     * @param {number} offset
     * @constructor
     */
    sf2.Riff.Chunk = function (type, size, offset) {
      /** @type {string} */
      this.type = type;
      /** @type {number} */
      this.size = size;
      /** @type {number} */
      this.offset = offset;
    };

    sf2.Riff.Parser.prototype.parse = function () {
      /** @type {number} */
      var length = this.length + this.offset;

      this.chunkList = [];

      while (this.ip < length)
        this.parseChunk();
    };

    sf2.Riff.Parser.prototype.parseChunk = function () {
      /** @type {ByteArray} */
      var input = this.input,
      /** @type {number} */
	  ip = this.ip,
      /** @type {number} */
	  size;

      this.chunkList.push(new sf2.Riff.Chunk(
        String.fromCharCode(input[ip++], input[ip++], input[ip++], input[ip++]),
        (size = this.bigEndian ?
           ((input[ip++] << 24) | (input[ip++] << 16) |
            (input[ip++] <<  8) | (input[ip++]      )) :
           ((input[ip++]      ) | (input[ip++] <<  8) |
            (input[ip++] << 16) | (input[ip++] << 24))
        ),
        ip
      ));

      ip += size;

      // padding
      if (this.padding && ((ip - this.offset) & 1) === 1)
        ip++;

      this.ip = ip;
    };

    /**
     * @param {number} index chunk index.
     * @return {?sf2.Riff.Chunk}
     */
    sf2.Riff.Parser.prototype.getChunk = function (index) {
      /** @type {sf2.Riff.Chunk} */
      var chunk = this.chunkList[index];

      if (chunk === undefined)
        return null;

      return chunk;
    };

    /**
     * @return {number}
     */
    sf2.Riff.Parser.prototype.getNumberOfChunks = function () {
      return this.chunkList.length;
    };

    return sf2;
}));
// sndmid.js - audio output using HTML5 MIDI
//
// Copyright (C) 2019-2026 Jean-François Moine
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

// Midi5 creation

// @conf: configuration object - all items are optional:
//	onend: callback function called at end of playing
//		Argument:
//			repv: last repeat variant number
//	onnote: callback function called on note start/stop playing
//		Arguments:
//			i: start index of the note in the ABC source
//			on: true on note start, false on note stop

//  When playing, the following items must/may be set:
//	speed: (mandatory) must be set to 1
//	new_speed: (optional) new speed value

// Midi5 methods

// get_outputs() - get the output ports
//
// set_output() - set the output port
//
// play() - start playing
// @start -
// @stop: start and stop music symbols
// @level: repeat variant (optional, default = 0)
//
// stop() - stop playing

function Midi5(i_conf) {
    var	po,
	conf = i_conf,		// configuration
	empty = function() {},
	det_tb,			// detune table
	rf,			// get_outputs result function
	op			// output MIDI port

	// return the play real time in seconds
	function get_time(po) {
		return window.performance.now() / 1000
	} // get_time()

    var	mutone = function(k, a, t) {
		if (!det_tb) {
			if (!a)
				return		// no microtone
			det_tb = {}
		}
		if (!Midi5.ma.sysexEnabled) {	// no SysEx
			mutone = empty		// don't come back here anymore
			return
		}
	    var	old_a = det_tb[k]		// previous detune of 'k'

		if ((!old_a && !a)
		 || old_a == a)
			return			// same detune
		det_tb[k] = a

		a *= 163.84			// 16384 / 100
		po.op.send(new Uint8Array([
			0xf0, 0x7f,		// realtime SysEx
			0x7f,			// all devices
			0x08,			// MIDI tuning
			0x02,			// note change
			0,			// tuning prog number
			0x01,			// number of notes
				k,		// key
				k,		// semitone
				(a >> 7) & 0x7f, // fraction of semitone
				a & 0x7f,
			0xf7			// SysEx end
			]), t)
	} // mutone()

	// create a note
	// @po = play object
	// @s = symbol
	// @k = MIDI key + detune
	// @t = audio start time (s)
	// @d = duration adjusted for speed (s)
	function note_run(po, s, k, t, d) {
	    var	j,
		a = (k * 100) % 100,	// detune in cents
		c = po.v_c[s.v],
		i = po.c_i[c]

		k |= 0			// remove the detune value

		t *= 1000		// convert to ms
		d *= 1000

		mutone(k, a, t)		// handle microtone accidentals

		po.op.send(new Uint8Array([0x90 + c, k,
				(po.conf.gain ?? .7) * 127]), t)	// note on
		po.op.send(new Uint8Array([0x80 + c, k, 0]), t + d - 20) // note off
	} // note_run()

	// send a MIDI control
	function midi_ctrl(po, s, t) {
		po.op.send(new Uint8Array([0xb0 + po.v_c[s.v],
					s.ctrl, s.val]),
			t * 1000)
	} // midi_ctrl()

	// change the channel and/or send a MIDI program	
	function midi_prog(po, s) {
	    var	i,
		c = s.chn

		po.v_c[s.v] = c

		// at channel start, reset and initialize the controllers
		if (po.c_i[c] == undefined) {
//fixme: does not work with fluidsynth
			po.op.send(new Uint8Array([0xb0 + c, 121, 0]))
//fixme: is this useful?
if(0){
			if (s.p_v.midictl) {
			    for (i in s.p_v.midictl)
				po.op.send(new Uint8Array([0xb0 + c,
							i,
							s.p_v.midictl[i]]))
			}
}
		}

		i = s.instr
		if (i != undefined) {		// if not channel only
			po.c_i[c] = i		// send a MIDI program
			po.op.send(new Uint8Array([0xc0 + c, i & 0x7f]))
		}
	} // midi_prog()

	// MIDI output is possible,
	// return the possible ports in return to get_outputs()
	function send_outputs(access) {
	    var	o, os,
		out = []

		Midi5.ma = access	// store the MIDI access in the Midi5 function

		if (access && access.outputs.size > 0) {
			os = access.outputs.values()
			while (1) {
				o = os.next()
				if (!o || o.done)
					break
				out.push(o.value.name)
			}
		}
		rf(out)
	} // send_outputs()

// public methods
	return {

		// get outputs
		get_outputs: function(f) {
			if (!navigator.requestMIDIAccess) {
				f()			// no MIDI
				return
			}
			rf = f

			// open MIDI with SysEx
			navigator.requestMIDIAccess({sysex: true}).then(
				send_outputs,
				function(msg) {
					rf()
				}
			)
		}, // get_outputs()

		// set the output port
		set_output: function(name) {
			if (!Midi5.ma)
				return
		    var o,
			os = Midi5.ma.outputs.values()

			while (1) {
				o = os.next()
				if (!o || o.done)
					break
				if (o.value.name == name) {
					op = o.value
					break
				}
			}
		},

		// play the symbols
		play: function(i_start, i_end, i_lvl, i_loop) {
			po = {
				conf: conf,	// configuration
				onend: conf.onend || empty,
				onnote: conf.onnote || empty,
//				stop: false,	// stop playing
				s_end: i_end,	// last music symbol / null
				s_cur: i_start,	// current music symbol
//				repn: false,	// don't repeat
				repv: i_lvl || 0, // repeat variant number
				tgen: 2, 	// generate by 2 seconds
				get_time: get_time,
				midi_ctrl: midi_ctrl,
				midi_prog: midi_prog,
				note_run: note_run,
				timouts: [],

				// MIDI specific
				op: op,		// output port
				v_c: [],	// voice to channel
				c_i: []		// channel to instrument
			}

			// if playback loop, set the restart point
			if (i_loop)
				po.s_loop = i_start

			abc2svg.play_next(po)
		}, // play()

		// stop playing
		stop: function() {
			po.stop = true
			po.timouts.forEach(function(id) {
						clearTimeout(id)
					})
			abc2svg.play_next(po)
//			po.onend(repv)
//fixme: op.clear() should exist...
			if (op && op.clear)
				op.clear()
		} // stop()
	} // returned object
} // end Midi5
// follow-1.js - file included in snd-1.js
//
// This script permits to follow the notes while playing.
// Scrolling the music may be disabled setting 'no_scroll' in the window object.
//
// Copyright (C) 2015-2022 Jean-Francois Moine
//
// This file is part of abc2svg.
//
// abc2svg is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with abc2svg.  If not, see <http://www.gnu.org/licenses/>.

// init
function follow(abc, user, playconf) {
    var	keep_types = {
		note: true,
		rest: true
	}

user.anno_stop = function(type, start, stop, x, y, w, h) {
	if (!keep_types[type])
		return

	// create a rectangle
	abc.out_svg('<rect class="abcr _' + start + '_" x="');
	abc.out_sxsy(x, '" y="', y);
	abc.out_svg('" width="' + w.toFixed(2) +
		'" height="' + abc.sh(h).toFixed(2) + '"/>\n')
}

	playconf.onnote = function(i, on) {
	    var	b, e, elts,
		x = 0,
		y = 0

		if (abc2svg.mu)			// if many tunes with same offsets
			elts = abc2svg.mu.d.getElementsByClassName('_' + i + '_')
		else
			elts = document.getElementsByClassName('_' + i + '_')
		if (!elts || !elts.length)
			return			// no symbol?
		e = elts[0]

		e.style.fillOpacity = on ? 0.4 : 0

			// scroll for the element to be in the screen
			if (on && !window.no_scroll) {	
				b = e.getBoundingClientRect()

				// normal
				if (b.top < 0
				 || b.bottom > window.innerHeight * .8)
					y = b.top - window.innerHeight * .3

				// single line
				if (b.left < 0
				 || b.right > window.innerWidth * .8)
					x = b.left - window.innerWidth * .3
				if (x || y)
					window.scrollBy({
						top: y,
						left: x,
						behavior: (x < 0 || y)
								? 'instant'
								: 'smooth'
					})
			}
	}
} // follow()

// create the style of the rectangles
if (typeof document != "undefined")	// snd-1.js can be used out of browser context
(function () {
    var	sty = document.createElement("style")
	sty.innerHTML = ".abcr {fill: #d00000; fill-opacity: 0; z-index: 15}"
	document.head.appendChild(sty)
})()
// chord.js - generation of accompaniment
//
// Copyright (C) 2020-2026 Jean-François Moine and Seymour Shlien
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

// This file contains the configuration and the generation
// of the accompaniment chords.

// %%chordkit: set chord parameters
//
// - define a chord as one letter
// %%chordkit [ <single_letter> "=" <chord> ]*
// ex: %%chordkit f=*1, c=139
//
// - define the chord types (qualities)
// %%chordkit "type" "=" [ <chord_type> ":" <ABC_notes> ]*
// ex: %%chordkit type=m:C_EG dim7:C_E^FA
//
// - define general parameters (instruments, volume...)
// %%chordkit [ <keyword> "=" <value> [ "," <value> ] ]*
//   with the keywords:
//		instr = instrument_chord [ "," instrument_bass]
//		vol = volume_chord [ "," volume_bass ]	% 0..127
// ex: %%chordkit instr=guitnyl % guitar nylon
//
// %%chord: define the transformation of a chord symbol into a playable chord
//
// %%chord [ <number_of_measures> ] [ <list_of_notes/chords> ]
//
// On playback, the list of the notes/chords is played during the
// <number_of_measures>.
// If this number is null, chord playback is stopped. Then, playing
// may be restarted with the previous or a new list of notes/chords by
// setting again this number.
//
// The notes are the offsets (indexes) of the notes in the current chord symbol
// - '0' is a rest
// - '1' is the tonic
// - '3' is the note between the tonic and the dominant (2nd, maj/min 3nd or 4th)
// - '5' is the dominant (5th)
// - '7' is the 6th or the 7th or even 5th if no 5 in the chord
// - '8' and '9' are the last notes of the chord (9th, 11th)
//
// note:	1 __3_ _5_ ___7___ _8  _9
// MIDI:	0 2345 678 9,10,11 14  17
// C chord:	C D EF  G  A    B   D'  F'
//
// The notes/chords are separed by spaces. Each note (sole note or
// individual note of a chord) may be followed by one or many commas or
// single quotes that change the note pitch to a lower or upper octave.
//
// A star (*) before a note means the note is a bass note that may be played
// by an other instrument (%%chordkit chord bassinstr=<instrument_name>)
// (the bass stuff is not coded yet)
//
// A plus sign (+) is a special note that
// - indicates continuous chords when it is the first item in the list.
//	The exact chord may be defined by the 2nd item. It defaults to *1,136.
// - continues the previous note/chord.
//
// ex: %%chord 1 *1, 135 0 5, 137 +

// -- chord table --
// from https://en.wikipedia.org/wiki/Chord_(music)
// index = chord symbol type
// value: array of MIDI pitch / root
//	index = inversion
abc2svg.chnm = {
	'': [0, 4, 7],
	'6': [0, 4, 7, 9],
	'7': [0, 4, 7, 10],
	M7: [0, 4, 7, 11],
	aug: [0, 4, 8],
	aug7: [0, 4, 8, 10],
	m: [0, 3, 7],
	m6: [0, 3, 7, 9],
	m7: [0, 3, 7, 10],
	mM7: [0, 3, 7, 11],
	dim: [0, 3, 6],
	dim7: [0, 3, 6, 9],
	m7b5: [0, 3, 6, 10],
	'9': [0, 4, 7, 10, 14],
//	m9:
//	maj9:
//	M9:
	'11': [0, 4, 7, 10, 14, 17],
	sus4: [0, 5, 7]
//	sus9:
//	'7sus4':
//	'7sus9':
//	'5':
}

abc2svg.letmid = {			// letter -> MIDI pitch
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11
} // letmid

abc2svg.chord = {
    alias: {				// default aliases (from abcMIDI)
	c: "135789",
	b: "*1,135789",
	f: "*1,",
	g: "1'",
	h: "3'",
	i: "5'",
	j: "7'",
	z: "0",
	G: "1",
	H: "3",
	I: "5",
	J: "7",
    }, // alias

// name of the MIDI instruments
    prg_nam: `
0 acoustic grand piano
1 bright acoustic piano 
2 electric grand piano
3 honky-tonk piano 
4 electric piano 1 
5 electric piano 2 
6 harpsichord 
7 clavi 
8 celesta 
9 glockenspiel 
10 music box 
11 vibraphone 
12 marimba 
13 xylophone 
14 tubular bells 
15 dulcimer 
16 drawbar organ 
17 percussive organ 
18 rock organ 
19 church organ 
20 reed organ 
21 accordion 
22 harmonica 
23 tango accordion 
24 acoustic guitar (nylon) 
25 acoustic guitar (steel) 
26 electric guitar (jazz) 
27 electric guitar (clean) 
28 electric guitar (muted) 
29 overdriven guitar 
30 distortion guitar 
31 guitar harmonics 
32 acoustic bass 
33 electric bass (finger) 
34 electric bass (pick) 
35 fretless bass 
36 slap bass 1 
37 slap bass 2 
38 synth bass 1 
39 synth bass 2 
40 violin 
41 viola
42 cello 
43 contrabass 
44 tremolo strings 
45 pizzicato strings 
46 orchestral harp 
47 timpani 
48 string ensemble 1 
49 string ensemble 2 
50 synthstrings 1 
51 synthstrings 2 
52 choir aahs 
53 voice oohs 
54 synth voice 
55 orchestra hit 
56 trumpet 
57 trombone 
58 tuba 
59 muted trumpet 
60 french horn 
61 brass section 
62 synthbrass 1 
63 synthbrass 2 
64 soprano sax
65 alto sax 
66 tenor sax 
67 baritone sax 
68 oboe 
69 english horn
70 bassoon 
71 clarinet 
72 piccolo
73 flute 
74 recorder 
75 pan flute
76 blown bottle
77 shakuhachi 
78 whistle 
79 ocarina 
80 lead 1 (square) 
81 lead 2 (sawtooth)
82 lead 3 (calliope) 
83 lead 4 (chiff) 
84 lead 5 (charang) 
85 lead 6 (voice) 
86 lead 7 (fifths) 
87 lead 8 (bass + lead)
88 pad 1 (new age)
89 pad 2 (warm) 
90 pad 3 (polysynth)
91 pad 4 (choir) 
92 pad 5 (bowed) 
93 pad 6 (metallic) 
94 pad 7 (halo) 
95 pad 8 (sweep) 
96 fx 1 (rain) 
97 fx 2 (soundtrack) 
98 fx 3 (crystal) 
99 fx 4 (atmosphere) 
100 fx 5 (brightness) 
101 fx 6 (goblins) 
102 fx 7 (echoes) 
103 fx 8 (sci-fi) 
104 sitar 
105 banjo 
106 shamisen 
107 koto 
108 kalimba 
109 bag pipe 
110 fiddle 
111 shanai 
112 tinkle bell 
113 agogo 
114 steel drums 
115 woodblock 
116 taiko drum 
117 melodic tom 
118 synth drum 
119 reverse cymbal 
120 guitar fret noise 
121 breath noise 
122 seashore 
123 bird tweet 
124 telephone ring 
125 helicopter 
126 applause 
127 gunshot
`,

    // %%chordkit command
    set_kit: function(abc, cmd, parm) {
	if (!parm)
		return
    var	k, s, v,
	cfmt = abc.cfmt(),
	curv = abc.get_curvoice(),
	parse = abc.get_parse(),
	a = parm.match(/=|"[^"]*"|[^\s"=]+/g),
	val = {}

	function bad() {
		abc.syntax(1, abc.errs.bad_val, "%%chordkit")
	}

	// convert ABC into a list of pitch
	function abc2pit(p) {
	    var i, c, a,
		o = []

		for (i = 0; i < p.length; i++) {
			c = p[i]
			if (c == '^')
				a = 1, c = p[++i]
			else if (c == '_')
				a = -1, c = p[++i]
			else
				a = 0
			c = "C D EF G A Bc d ef g a b".indexOf(c)
			if (c < 0)
				return
			o.push(c)
		}
		return o
	} // abc2pit()

	// convert an instrument name into a MIDI program number
	function get_prog(p) {
	    var	i, j, k, l,
		nm = abc2svg.chord.prg_nam

		p = p.replace(/[-_]/g, ' ').trim().toLowerCase().split(' ')
		i = 0
		while (1) {			// search the 1st word
			j = nm.indexOf(p[i])
			if (j > 0
			 && (nm[j - 1] == ' ' || nm[j - 1] == '('))
				break
			if (++i >= p.length)
				return		// no instrument!
		}
		l = nm.lastIndexOf('\n', j)
		if (l < 0)
			l = 0			// candidate
		j = l
		if (i < p.length - 1)
		    while (1) {			// search if many words in a line
			k = nm.indexOf(p[i + 1], j + 1)
			if (k < 0)
				break
			if (nm[k - 1] != ' ' && nm[k - 1] != '(') {
				j = k
				continue
			}
			k = nm.lastIndexOf('\n', k)
			j = nm.indexOf(p[i], k)
			if (j < 0)
				break
			j = nm.lastIndexOf('\n', j)
			if (j == k) {
//fixme: continue with the next word
				l = j
				break
			}
		}
		return parseInt(nm.slice(l, l + 3))
	} //get_prog()

	if (!a)
		return bad()
	while (1) {
		k = a.shift()
		if (!k)
			break
		if (a[0] != '=' || !a[1])
			return bad()
		a.shift()
		v = a.shift()

		// if one letter, this is an alias
		if (/^[A-Za-z]$/.test(k)) {
			if (!/^(\*?[0135-9],*'*)+$/.test(v))	// '
				return bad
			if (!val.alias)
				val.alias = {}
			val.alias[k] = v
			continue
		}
		switch (k) {
		case "type":
			k = v.split(':')
			if (k.length != 2)
				return bad()
			v = abc2pit(k[1])
			if (!v)
				return bad()
			chnm[k[0]] = v
			continue
		case "alias":
			return bad()			// don't change this object
		case "instr":
			if (v[0] < '1' || v[0] > '9') {
				if (v[0] == '"')
					v = v.slice(1, -1)
				v = get_prog(v)
			}
			k = "prog"
			// fall thru
		case "prog":
			v = +v
			break
		case "oct":
			k = "trans"
			v = v == '-' ? -1 : 1
			break
		case "vol":
			v = +v
			if (v < 0 || v > 127)
				v = null
			break
		}
		if (v == null || isNaN(v))
			return bad()
		val[k] = v
// missing:
// cfmt.chord.bprog	in "prog" or "instr"
// cfmt.chord.bvol	in "vol"
	}
	if (parse.state >= 2
	 && curv) {
		s = abc.new_block("midigch")
		s.play = s.invis = 1 //true
		Object.assign(s, val)
	} else {
		if (!cfmt.chord)
			cfmt.chord = {}
		if (cfmt.chord.alias && val.alias) {
			Object.assign(cfmt.chord.alias, val.alias)
			delete val.alias
		}
		if (cfmt.chord.type && val.type) {
			Object.assign(cfmt.chord.type, val.type)
			delete val.type
		}
		Object.assign(cfmt.chord, val)	// keep the starting parameters
	}
    }, // set_kit()

    // %%chord command
    set_fmt: function(of, cmd, parm) {
	if (cmd == "chordkit")
		return abc2svg.chord.set_kit(this, cmd, parm)
	if (cmd != "chord")
		return of(cmd, parm)
	if (!parm)
		parm = "1"		// by default, restart with one measure
    var	c, i, j, n, rhy, s,
	abc = this,
	cfmt = abc.cfmt(),
	curv = abc.get_curvoice(),
	parse = abc.get_parse(),
	a = parm

	function bad() {
		abc.syntax(1, abc.errs.bad_val, "%%chord")
	}

	n = +a[0]			// number of measures
	if (isNaN(n))
		n = 1
	else
		a = a.slice(1).trim()
	if (!cfmt.chord) {
		if (!n)
			return
		cfmt.chord = {}
	}
	if (!cfmt.chord.alias)
		cfmt.chord.alias = {}

	// convert [ letter[digit] ]* into [ chord [ + ]* ]*
	if (/[A-Za-z]/.test(a)) {
		rhy = []
		i = 0
		if (a[0] == '+')
			rhy.push('+'),		// no rhythm
			i++
		for ( ; i < a.length; i++) {
			c = a[i]
			if (c == '+')
				c = '2'
			if (c >= '2' && c < '9') {
				while (--c > 0)
					rhy.push('+')
				continue
			}
			if (cfmt.chord.alias[c])
				rhy.push(cfmt.chord.alias[c])
			else if (abc2svg.chord.alias[c])
				rhy.push(abc2svg.chord.alias[c])
			else
				return bad()
		}
	} else {				// digital values
		rhy = a.match(/((\*?[0135-9],*'*)+|\+)/g)	// '
	}
	if (!rhy)
		return bad()

	if (parse.state >= 2
	 && curv) {
		s = abc.new_block("midigch")
		s.play = s.invis = 1 //true
		s.on = n
		if (n)
			s.gchnb = n
		if (rhy.length)
			s.rhy = rhy
	} else {
		cfmt.chord.on = n
		if (n)
			cfmt.chord.gchnb = n
		if (rhy.length)
			cfmt.chord.rhy = rhy
	}
    }, // set_fmt()

    set_hooks: function(abc) {
	abc.set_format = abc2svg.chord.set_fmt.bind(abc, abc.set_format)
    }
} // chord

// function called from sndgen on playback start
abc2svg.genchrd = function(first,	// first symbol in time
			 voice_tb,	// table of the voices
			 cfmt) {	// tune parameters
    var	chnm, i, k, vch, s, gchon, rhy, ti, dt, gchnb, inv,
	chmid = [],			// bass and chord pitches
	md = first.p_v.meter.wmeasure,	// measure duration
	nextim = 0,
	C = abc2svg.C,
	trans = 48 + (cfmt.chord.trans ? cfmt.chord.trans * 12 : 0)

	// create a chord according to the bass note
	// ('inv' is set when the chord is the first inversion EGc)
	function chcr(b, ch) {
	    var	j, r,
		i = ch.length

		if (b) {
			while (--i > 0) {
				if (ch[i] == b)		// search the bass in the chord
					break
			}
			if (i > 0) {			// do a chord inversion
				r = []
				for (j = i; j < ch.length; j++)
					r.push(ch[j])
				for (j = 0; j < i; j++)
					r.push(ch[j] + 12)
			}
		}
		if (!r)
			r = ch.slice()
		if (!i)
			r[0] = b - 12		// bass one octave lower

		// don't double the third
		inv = rhy[0] == '+'		// if no rhythm
			&& i == 1
		return r
	} // chcr()

	// return a new chord rhythm from a meter (M:)
	function meterhy(s) {
		if (!s.a_meter[0])
			return '+'		// M:none
	    var	r,
		t = s.a_meter[0].top,
		b = s.a_meter[0].bot

		switch (b) {
		case '2':
			b = 4
			t *= 2
			// fall thru
		case undefined:
			if (t[0] == 'C')
				t = 4, b = 4
			// fall thru
		case '4':
			if (t == '3')
				return "fzczcz"
			return "fzczfzczfzcz".slice(0, t * 2)
		case '8':
			return "fzcfzcfzcfzc".slice(0, t)
		}
		return 'z'			// no chord
	} // meterhy()

	// build a chord rhythm
	function bld_rhy(p) {
	    var	i, c, n

	    if (typeof p != "string") {
		rhy = p
	    } else {
		rhy = p == '+'
			? p			// no rhythm
			: p.match(/\[([G-Lg-l]\,*)+\]\d?|[bcf-lzG-L],*\d?/g)
		if (!rhy)
//fixme: error
			rhy = '+'
		for (i = 0; i < rhy.length; i++) {
			c = rhy[i]
			n = c.slice(-1)
			if (n >= '2' && n <= '9') {
				rhy[i] = c.slice(0, -1)
				while (--n > 0)
					rhy.splice(++i, 0, '+')
			}
		}
	    }
		dt = md / rhy.length * gchnb		// delta time
	} // bld_rhy()

	// generate a chord
	function gench(sb, i) {
	    var	r, ch, b, m, n, nt,
		a = sb.a_gch[i].otext

		if (a[0] == 'n' || a[0] == 'N') {	// if no chord (N.C.)
			chmid = []
			return
		}
		if (a.slice(-1) == ')')			// if alternate chord
			a = a.replace(/\(.*/, '')	// remove it
		a = a.replace(/\(|\)|\[|\]/g,'')	// remove ()[]
			.replace(/♯/g, '#')
			.replace(/♭/g, 'b')
			.match(/([A-G])([#b]?)([^/]*)\/?(.*)/)
			// a[1] = note, a[2] = acc, a[3] = type, a[4] = bass
		if (!a)
			return

		r = abc2svg.letmid[a[1]]		// root

			switch (a[2]) {
			case "#": r++; break
			case "b": r--; break
			}
			if (!a[3]) {
				ch = chnm[""]
			} else {
				ch = abc2svg.ch_alias[a[3]]
				if (ch == undefined)
					ch = a[3]
				ch = chnm[ch]
				if (!ch)
					ch = a[3][0] == 'm' ? chnm.m : chnm[""]
			}
			if (a[4]) {			// bass
				b = a[4][0].toUpperCase()
				b = abc2svg.letmid[b]
				if (b != undefined) {
					switch (a[4][1]) {
					case "#": b = (b + 1) % 12; break
					case "b": b = (b + 11) % 12; break
					}
					b = b - r
					if (b < 0)
						b += 12
				}
			}

		// generate the notes of the chord
		chmid = chcr(b, ch)
		n = chmid.length
		r += trans
		for (m = 0; m < n; m++)
			chmid[m] += r
	} // gench()

	// stop the previous chord by setting its duration
	function set_dur(s2, tim) {			// previous chord
		if (s2.dur
		 || tim == s2.time
		 || s2.nhd == undefined)	// no chord yet
			return
		s2.dur = tim - s2.time
		for (var m = 0; m <= s2.nhd; m++)
			s2.notes[m].dur = s2.dur
	} // set_dur()

	// add a letter note to a chord
	function addnt(s, p) {
		p = "GHIJKghijk".indexOf(p)
		if ((p % 5) >= chmid.length)		// no such note in this chord
			return
		s.nhd++
		s.notes.push({
			midi: chmid[p % 5]		// skip the bass
		})
		if (p >= 5)
			s.notes[s.nhd].midi += 12	// upper octave
	} // addnt()

	// generate a chord from its digits
	function gennum(s, p) {
	    var	c, nt,
		m = 0

		if (p[0] == '*') {
			m++				// basse
//fixme: to do
		}
		for ( ; m < p.length; m++) {
			c = +p[m]
			switch (c) {
			case 1:
				c = chmid[0]
				break
			case 3:
				c = chmid[1]
				break
			case 5:
				c = chmid[2]
				break
			default:			// 7, 8, 9
				while (!chmid[c])
					c--
				c = chmid[c]
				if (s.notes[s.nhd] && s.notes[s.nhd].midi >= c)
					c = 0
				break
			}
			if (c) {
				s.nhd++
				nt = {
					midi: c
				}
				s.notes.push(nt)
			}
			while (p[m + 1] == "'") {
				if (c)
					nt.midi += 12
				m++
			}
			while (p[m + 1] == ',') {
				if (c)
					nt.midi -= 12
				m++
			}
		}
	} // gennum()

	// insert a chord in the chord voice
	function insch(s_next, tim) {
		if (!chmid.length)
			return			// no defined chord yet
	    var	s, m,
		s2 = vch.last_sym,
		i = rhy[ti++]

		switch (i[0]) {
		case '+':			// same chord
			if (ti != 1)		// if not first +
				return
			ti = 0
			if (rhy[1])
				i = rhy[1]	// explicit continuous chord
			break
		case undefined:
		case '0':
		case 'z':
			set_dur(s2, tim)	// stop the previous chord
			return
		}

		s = {
			v: vch.v,
			p_v: vch,
			type: C.NOTE,
			nhd: -1,
			notes: []
		}
		s.time = tim
		switch (i[0]) {
		case 'c':
			s.nhd = chmid.length - 1
			for (m = 0; m <= s.nhd; m++)
				s.notes.push({
					midi: chmid[m]
				})
			break
		case '[':
			for (m = 1; m < i.length - 1; m++) {
				addnt(s, i[m])
				while (i[m + 1] == ',')
					s.notes[s.nhd].midi -= 12,
					m++
			}
			break
		default:
			if ((i[0] >= '1' && i[0] <= '9')
			 || i[0] == '*') {
				gennum(s, i)		// chords as digits
				break
			}
			addnt(s, i[0])			// chords as letters
			m = 1
			while (i[m] == ',')
				s.notes[0].midi -= 12,
				m++
			break
		case 'f':
			s.notes[0] = {
				midi: chmid[0] - 12
			}
			s.nhd = 0		// keep the chord root
			break
		case '+':			// no rhythm
		case 'b':
			s.nhd = chmid.length
			s.notes.push({
				midi: chmid[0] - 12
			})
			for (m = 0; m < s.nhd; m++)
				s.notes.push({
					midi: chmid[m]
				})
			break
		}
		if (s.nhd < 0)
			return

		// don't double the mediant (when a bass)
		if (inv
		 && s.notes[0].midi % 12 == s.notes[1].midi % 12)
			s.notes[1].midi = s.notes[3].midi - 12	// tonic
			
		s.prev = s2			// previous chord
		s2.next = s
		set_dur(s2, tim)		// stop the last chord
		
		vch.last_sym = s

		if (s_next) {				// if not last symbol of the tune
			s.ts_next = s_next		// insert before a bar
			s.ts_prev = s_next.ts_prev
			s_next.ts_prev = s
//			if (s.ts_prev)
				s.ts_prev.ts_next = s
		} else {				// no bar at end of tune
			while (s2.ts_next)
				s2 = s2.ts_next
			s2.ts_next = s
			s.ts_prev = s2
		}
	} // insch()

	// -- genchrd --

	// set the chordnames defined by %%MIDI chordname
	chnm = abc2svg.chnm
	if (cfmt.chord.names) {
		for (k in cfmt.chord.names) {
			chnm[k] = []
			for (i = 0; i < cfmt.chord.names[k].length; i++)
				chnm[k].push(+cfmt.chord.names[k][i])
		}
	}

	// create the chord voice
	vch = {
		v: voice_tb.length,
		id: "_chord",
		time: 0,
		sym: {
			type: C.BLOCK,
			subtype: "midiprog",
			chn: 15,				// MIDI channel
			instr: cfmt.chord.prog || 0,
			time: 0,
			dur: 0,
			next: {
				type: C.BLOCK,
				subtype: "midictl",
				time:0,
				dur: 0,
				ctrl: 7,		// volume
				val: cfmt.chord.vol || 75
			}
		}
	}
	vch.sym.p_v = vch
	vch.sym.v = vch.v
	vch.sym.next.p_v = vch
	vch.sym.next.v = vch.v
	vch.sym.next.prev = vch.sym
	vch.last_sym = vch.sym.next
	voice_tb.push(vch)

	s = first

	// insert the MIDI program and the volume of the chord voice after the tempo
	while (s.type != C.TEMPO
	 && s.ts_next && !s.ts_next.dur)	// but before the first note
		s = s.ts_next
	vch.sym.ts_prev = s
	vch.sym.ts_next = vch.sym.next
	vch.sym.next.ts_prev = vch.sym
	vch.sym.next.ts_next = s.ts_next
	if (s.ts_next)
		s.ts_next.ts_prev = vch.sym.next
	s.ts_next = vch.sym

	// loop on the symbols and add the accompaniment chords
	if (cfmt.chord.gchon != false)
		gchon = 1			// chordon by default
	gchnb = cfmt.chord.gchnb || 1
	s = first
	bld_rhy(cfmt.chord.rhy			// chord rhythm
		|| meterhy(s.p_v.meter))
	ti = 0					// time index in rhy
	while (1) {
		if (gchon) {
			while (s.time > nextim
			       && ti < rhy.length) {
				insch(s, nextim)	// generate the rhythm
				nextim += rhy[0] == '+' ? 100000 : dt
			}
			if (s.bar_type == "|"		// if a normal measure bar
			 && rhy[0] != '+'
			 && nextim != s.time) {		// and wrong times
//fixme: measure error
				nextim = s.time		// resynchronize
				ti = 0
			}
		}
		if (gchon && s.a_gch) {
			for (i = 0; i < s.a_gch.length; i++) {
				if (s.a_gch[i].type != 'g')
					continue
				gench(s, i)
				if (rhy[0] == '+'
				 && chmid.length)
					nextim = s.time
				break
			}
		}
		if (!s.dur) {
			if (s.bar_num) {		// if measure bar
				if (gchnb == 1
				 || !((s.bar_num - 1) % gchnb))
					ti = 0		// reset the time index
			} else if (s.wmeasure) {	// if meter
				md = s.wmeasure
				if (rhy[0] != '+')
					bld_rhy(meterhy(s))
			} else if (s.subtype == "midigch") {
				if (gchon && s.rhy)
					bld_rhy(s.rhy)	// new rhythm
				if (s.gchnb)
					gchnb = s.gchnb
				if (s.on != undefined) {
					gchon = s.on
					if (!gchon)
						set_dur(vch.last_sym, s.time)
				}
			}
		}
		if (!s.ts_next)
			break
		s = s.ts_next
	}
	if (gchon)  {
			while (s.time + (s.dur || 0) > nextim) {
				insch(s.dur ? null : s, nextim)
				if (rhy[0] == '+')
					break
				nextim += dt
			}
		set_dur(vch.last_sym, s.time + (s.dur || 0))
	}
} // genchrd()

// define the commands %%chordkit and %%chord
if (!abc2svg.mhooks)
	abc2svg.mhooks = {}
abc2svg.mhooks.chord = abc2svg.chord.set_hooks
// drum.js - generation of drum sequences
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

// This file contains the configuration and the generation
// of drum accompaniment.

// %%begindrum .. %%enddrum: define a drum pattern
//
// These sequences contain drum tabs (https://en.wikipedia.org/wiki/Drum_tablature).
// When the instrument letters are not well-known ones, a legend may be added.
// The default instrument letters are
//
// CC |-Crash cymbal----|
// H  |-Hi-Hat----------|
// HH |-Hi-Hat----------|
// Rd |-Ride cymbal-----|
// S  |-Snare-drum------|
// SD |-Snare-drum------|
// T1 |-High-tom--------|
// T2 |-Mid-tom---------|
// FT |-Floor-tom-------|
// B  |-Bass-drum-------|
// BD |-Bass-drum-------|
// Hf |-Hi-hat-foot-----|

// %%drum [ sequence_ID ]
// This command activates drum playback, starting the sequence ID.
// If no ID, drum playback stops.

// table of the drum instruments
//fixme: change this table and the associated code
//	for it accepts "Hi-hat-foot" as well as "pedal hi-hat"
abc2svg.perc_nam = `
35 acoustic bass drum
36 bass drum 1
37 side stick
38 acoustic snare
39 hand clap
40 electric snare
41 low floor tom
42 closed hi-hat
43 high floor tom
44 pedal hi-hat
45 low tom
46 open hi-hat
47 low-mid tom
48 hi-mid tom
49 crash cymbal 1
50 high tom
51 ride cymbal 1
52 chinese cymbal
53 ride bell
54 tambourine
55 splash cymbal
56 cowbell
57 crash cymbal 2
58 vibraslap
59 ride cymbal 2
60 hi bongo
61 low bongo
62 mute hi conga
63 open hi conga
64 low conga
65 high timbale
66 low timbale
67 high agogo
68 low agogo
69 cabasa
70 maracas
71 short whistle
72 long whistle
73 short guiro
74 long guiro
75 claves
76 hi wood block
77 low wood block
78 mute cuica
79 open cuica
80 mute triangle
81 open triangle
`

// default instrument shortcuts
abc2svg.perc_instr = {
B:  35,
BD: 35,
S:  38,
SD: 38,
H:  42,
HH: 42,
FT: 43,
Hf: 44,
T2: 47,
T1: 50,
Rd: 51,
CC: 57,
}

abc2svg.drum = {

    // %%begindrum..%%enddrum command
    beg_end: function(of, type, opt, txt) {
	if (type != "drum")
		return of(type, opt, txt)
    var	l, p, pat,
	abc = this,
	cfmt = abc.cfmt()

	function bad() {
		abc.syntax(1, abc.errs.bad_val, "%%begindrum")
	}

	// convert a percussion name into a MIDI key
	function get_perc(p) {
	    var	i, j, k, l

		p = p.replace(/-/g, ' ').trim().toLowerCase().split(' ')
		for (i = 0; i < p.length; i++)
			p[i] = ' ' + p[i]	// start the words by a space
		i = 0
		while (1) {			// search the 1st word
			j = abc2svg.perc_nam.indexOf(p[i])
			if (j > 0)
				break
			if (++i >= p.length)
				return		// no instrument!
		}
		l = abc2svg.perc_nam.lastIndexOf('\n', j)
		if (l < 0)
			l = 0			// candidate
		j = l
		if (i < p.length - 1)
		    while (1) {			// search if many words in a line
			k = abc2svg.perc_nam.indexOf(p[i + 1], j + 1)
			if (k < 0)
				break
			k = abc2svg.perc_nam.lastIndexOf('\n', k)
			j = abc2svg.perc_nam.indexOf(p[i], k)
			if (j < 0)
				break
			j = abc2svg.perc_nam.lastIndexOf('\n', j)
			if (j == k) {
//fixme: continue with the next word
				l = j
				break
			}
		}
		return parseInt(abc2svg.perc_nam.slice(l, l + 3))
	} // get_perc()

	// --- beg_end ---
	if (!cfmt.drum)
		cfmt.drum = {}
	if (!cfmt.drum.pat)
		cfmt.drum.pat = {}
	pat = []
	txt = txt.trim().split(/\n+/)
	while (1) {
		l = txt.shift()				// next line
		if (!l)
			break
		l = /(^[A-Za-z0-9][A-Za-z0-9]?)\s*\|(.+)\|$/g.exec(l.trim())
		if (!l)
			return bad()
		if (/^[-ox|]*$/.test(l[2])) {		// if sequence
			pat.push({
				instr: l[1],
				seq: l[2]
			})
		} else {				// legend
			if (!cfmt.drum)
				cfmt.drum = {}
			if (!cfmt.drum.instr)
				cfmt.drum.instr = {}
			cfmt.drum.instr[l[1]] = get_perc(l[2])
		}
	}
	cfmt.drum.pat[opt] = pat
    }, // beg_end()

    // %%drum command
    set_fmt: function(of, cmd, parm) {
	if (cmd != "drum")
		return of(cmd, parm)
    var	i, j, k, n, p, instr, s,
	abc = this,
	cfmt = abc.cfmt(),
	curv = abc.get_curvoice(),
	parse = abc.get_parse(),
	pat = (parm && parm != "0") ? cfmt.drum.pat[parm] : null,
	seq = []

	function bad() {
		abc.syntax(1, abc.errs.bad_val, "%%drum")
	}

	if (!curv)
		return abc.syntax(1, "$1 must be in a voice", "%%drum")
	s = abc.new_block("mididrum")
	s.play = s.invis = 1 //true
	s.on = !!pat
	if (!pat)
		return
	s.nb = 1
	s.seq = seq

	// build an array of chords from the drum tab
	for (i = 0; i < pat.length; i++) {		// instrument loop
		instr = pat[i].instr
		instr = (cfmt.drum && cfmt.drum.instr && cfmt.drum.instr[instr])
			|| abc2svg.perc_instr[instr]
		if (!instr) {
//			return bad()
			abc.syntax(1, "Unknown instrument in %%drum " + parm)
			continue
		}
		p = pat[i].seq
		n = 1
		k = 0
		for (j = 0; j < p.length; j++) {
			switch (p[j]) {
			case 'o':
			case 'x':
				if (!seq[k])
					seq[k] = []
				seq[k].push(instr)
			default:			// ('-')
				k++
				break
			case '|':
				n++
				break
			}
		}
		if (n > s.nb)
			s.nb = n
		seq.length = k
	}
    }, //set_fmt()

    set_hooks: function(abc) {
	abc.do_begin_end = abc2svg.drum.beg_end.bind(abc, abc.do_begin_end)
	abc.set_format = abc2svg.drum.set_fmt.bind(abc, abc.set_format)
    }
} //drum

abc2svg.gendrum = function(first,	// first symbol in time
			 voice_tb,	// voice table
			 cfmt) {	// tune parameters
    var	c, i, on, n, nb, ss, v, seq, vols, l, dl, i_rst,
	s = first,
	C = abc2svg.C,
	vdr = {				// create the percussion voice
		v: voice_tb.length,
		id: "_drum",
		time: 0,
		sym: {
			type: C.BLOCK,
			subtype: "midiprog",
			chn: 9,		// percussion channel
//			instr: 0,
			time: 0,
			dur: 0
		}
	},
	_sdr = {			// drum template
		v: vdr.v,
		p_v: vdr,
		type: C.NOTE,
		nhd: 0
	}

	// generate the drum sequences up to the next %%drum or to the end of voice
	function gendr(ss, s) {
	    var	c, i, j, sdr, s2,
		ti = ss.time,
		te = s.time + (s.dur || 0),
		d = dl * nb / l		// base note duration

		while (!ss.dur)
			ss = ss.next
		while (ti < te) {
			if (ss.bar_type
			 && (ss.text >= '2' && ss.text <= '9')) {
				i = i_rst
				while (!ss.dur)
					ss = ss.ts_next
			} else {
				i = 0
			}
			for ( ; i < seq.length; i++) {	// generate 'nb' measures
				c = seq[i]
				if (!c) {
					ti += d
					continue
				}
				sdr = Object.create(_sdr)
				sdr.time = ti
				s2 = sdr
				sdr.dur = d
				sdr.notes = []
				sdr.nhd = c.length - 1
				for (j = 0; j < c.length; j++)
					sdr.notes.push({
						dur: d,
						midi: seq[i][j]
					})
				if (s2.next) {			// voice linkage
					sdr.next = s2.next
					s2.next = sdr
					sdr.prev = s2
					sdr.next.prev = sdr
				} else {			// first drum symbol
					vdr.last_sym.next = sdr
					sdr.prev = vdr.last_sym
					vdr.last_sym = sdr
				}

				// time linkage and repeat variants
				while (ss.ts_next && ss.time < ti)
					ss = ss.ts_next
				s = ss
				while (s.ts_next && !s.dur && s.time == ti) {
					if (s.bar_type
					 && s.text == '1')
						i_rst = i
					s = s.ts_next
				}
				while (s.ts_next && s.dur && s.time == ti
				    && s.v < sdr.v)
					s = s.ts_next
				sdr.ts_next = s
				sdr.ts_prev = s.ts_prev
				s.ts_prev = sdr
				sdr.ts_prev.ts_next = sdr

				ti += d
			}
			ss = s
		}
	} //gendr()

	// -- gendrum() --

	// link the drum voice
	vdr.sym.p_v = vdr
	vdr.sym.v = vdr.v
	vdr.last_sym = vdr.sym

	while (!s.dur)
		s = s.ts_next
	vdr.sym.ts_prev = s.ts_prev
	vdr.sym.ts_next = s
	vdr.sym.ts_prev.ts_next =
		s.ts_prev = vdr.sym

	// get the measure duration at start of tune
	dl = first.p_v.meter.wmeasure		// ending meter duration
	for (s = first; s && !s.bar_type; s = s.ts_next) {
		if (s.wmeasure) {
			dl = s.wmeasure		// starting meter duration
			break
		}
	}

	// generate the drum sequence per voice
	for (v = 0; v < voice_tb.length; v++) {
		on = seq = null
		nb = 1
		for (s = voice_tb[v].sym; s; s = s.next) {
			if (s.subtype != "mididrum") {
				if (s.wmeasure)
					dl = s.wmeasure
				continue
			}
			if (s.on != undefined)
				on = s.on		// on/off
			if (s.nb)
				nb = s.nb		// number of bars
			if (s.seq) {
				seq = s.seq
				l = seq.length
			}
			if (on && seq) {
				ss = s
				while (1) {
					if (!s.next
					 || s.next.subtype == "mididrum"
					 || s.next.wmeasure)
						break
					s = s.next
				}
				gendr(ss, s)
			}
		}
	}
	voice_tb.push(vdr)
} // gendrum()

// define the commands %%begindrum and %%drum
if (!abc2svg.mhooks)
	abc2svg.mhooks = {}
abc2svg.mhooks.drum = abc2svg.drum.set_hooks
