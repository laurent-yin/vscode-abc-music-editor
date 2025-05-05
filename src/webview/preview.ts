// Define interfaces for the VS Code API and abc2svg
declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

// Define interfaces for abc2svg
interface ABC2SVG {
    loadjs: (fn: string, relay?: (event?: any) => void, onerror?: (event?: any) => void) => void;
    Abc: new (user: User) => AbcInstance;
    modules: {
        load: (content: string, callback: () => void, errorCallback: (error: any) => void) => boolean;
    };
    C: any;
}

interface AbcInstance {
    tosvg: (id: string, content: string) => void;
    out_svg: (s: string) => void;
    out_sxsy: (x: number, y: string, sy: number) => void;
    sh: (h: number) => number;
    cfmt: () => any;
    tunes: Array<any>;
}

interface User {
    img_out: (s: string) => void;
    imagesize: string;
    errmsg: (msg: string, line?: number, col?: number) => void;
    anno_stop?: (type: string, start: number, stop: number, x: number, y: number, w: number, h: number, s: any) => void;
    page_format?: boolean;
}

interface PlayOptions {
    onend: (repv?: number) => void;
    onnote: (note: any) => void;
}

interface AbcPlay {
    play: (si: any, ei: any, repv?: number) => void;
    stop: () => void;
    add: (start: any, voice: any, options?: any) => void;
}

interface PlayState {
    abcplay?: AbcPlay;
    playing?: boolean;
    stop?: number;
    si?: any;
    ei?: any;
    loop?: boolean;
    repv?: number;
    click?: any;
}

// Interface for SVGElement className
interface SVGElementWithClassName extends SVGElement {
    className: {
        baseVal: string;
    };
}

// Declare global variables needed by abc2svg
declare const abc2svg: ABC2SVG;
declare function AbcPlay(options: PlayOptions): AbcPlay;
declare const LZString: any;

// Initialize variables
const vscode = acquireVsCodeApi();
let abc: AbcInstance;
let currentAbcContent = ''; // Store the current ABC text to detect changes
let user: User; // IMPORTANT: user needs to be in the global scope for some modules to work properly (e.g. page module)

// Variables needed for playback
const play: PlayState = {};
let tunes: any[];
let syms: any[] = [];   // Music symbol at source index
const selx: [number, number] = [0, 0]; // (start, end) of the selection
const selx_sav: number[] = []; // (saved while playing/printing)

// Callback called by abc2svg to load the modules it needs as part of its processing
abc2svg.loadjs = function(fn: string, relay?: (event?: any) => void, onerror?: (event?: any) => void): void {
    const script = document.createElement('script');
    script.src = `${(window as any).baseUri}/lib/${fn}`;
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

// Load snd-1.js for midi playback
abc2svg.loadjs("snd-1.js", function() {
    console.log("snd-1.js loaded successfully");
    play.abcplay = AbcPlay({
        onend: endplay,
        onnote: (note: any) => console.log("Playing note:", note),
    });
});

// Process messages received from the extension
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'render') {
        // Store the content in the outer scope variable
        const abcContent = msg.content;
        currentAbcContent = abcContent;
        const div = document.getElementById('sheet') as HTMLDivElement;
        div.innerHTML = '';

        if (abc2svg) {
            let abc_images = '';
            user = {
                img_out: (s: string) => { abc_images += s; },
                imagesize: 'width="100%"',
                errmsg: (msg: string, line?: number, col?: number) => { vscode.postMessage({ command: 'error', message: msg, line, col }); },
                anno_stop: function(type: string, start: number, stop: number, x: number, y: number, w: number, h: number, s: any) {
                    if (["beam", "slur", "tuplet"].indexOf(type) >= 0)
                        return;
                    syms[start] = s;	// Music symbol
            
                    // Create a rectangle
                    abc.out_svg('<rect class="abcr _' + start +
                        '_" x="');
                    abc.out_sxsy(x, '" y="', y);
                    abc.out_svg('" width="' + w.toFixed(2) +
                        '" height="' + abc.sh(h).toFixed(2) + '"/>\n');
                },
                page_format: true
            };
            
            function renderAbc(abcContent: string, div: HTMLDivElement): void {
                console.log('rendering ABC content');

                // TODO: remove this after finishing debugging fit2box
                // let cfmt = abc.cfmt();
                // cfmt.pagewidth = 600;
                // cfmt.pageheight = 800;

                abc.tosvg('abc', abcContent);
                div.innerHTML = abc_images;
                if (abc_images === '') {
                    console.log('no images generated');
                }
            }

            // Reset selection and symbols before re-render
            selx[0] = selx[1] = 0;
            syms = [];
            abc = new abc2svg.Abc(user);
            if (abc2svg.modules.load(abcContent, () => {
                console.log('rendering after loading modules');
                renderAbc(abcContent, div);
            }, console.error)) {
                // Modules were already loaded, callback won't be called, so call it manually
                console.log('rendering when modules.load returns true');
                renderAbc(abcContent, div);
            }
        }
    }
});

// TODO when clicking on a note, it selects the corresponding ABC
document.addEventListener('click', event => {
    const target = event.target as Element;
    
    // Handle SVG and HTML elements differently for className
    let cls = '';
    if (target instanceof SVGElement) {
        // SVG elements have className.baseVal
        cls = (target as SVGElementWithClassName)?.className?.baseVal || '';
    } else {
        // Regular HTML elements have className as string
        cls = String(target?.className || '');
    }
    
    if (cls.startsWith('selMarker')) {
        const match = cls.match(/_(\d+)-(\d+)_/);
        if (match) {
            vscode.postMessage({ command: 'selection', start: +match[1], stop: +match[2] });
        }
    }
});

// Open the ABC in Michael Eskin's ABC Editor in a browser
// This is sometimes useful for some practice features that are not yet implemented here
document.getElementById('open-web')?.addEventListener('click', () => {
    // Dynamically construct the URL
    const baseUrl = "https://michaeleskin.com/abctools/abctools.html";
    // Using LZString from the imported library
    const abcContent = LZString.compressToEncodedURIComponent(currentAbcContent);
    const queryParams = new URLSearchParams({
        lzw: abcContent,
        editor: "1"
    });
    const url = `${baseUrl}?${queryParams.toString()}`;

    vscode.postMessage({
        command: "openLink",
        url: url
    });
});

/** PLAYBACK IMPLEMENTATION, WORK IN PROGRESS **/

document.getElementById('play-button')?.addEventListener('click', () => {
    console.log('clicked on play');
    if (play.abcplay) {
        console.log('launching play');
        play_tune(0); // play the whole tune
    }
});

// Start playing
// -1: All (removed)
// 0: Tune
// 1: Selection
// 2: Loop
// 3: Continue
function play_tune(what: number): void {
    if (!abc)
        return;			// No generation yet
    
    const C = abc2svg.C;

    if (play.playing) {
        if (!play.stop) {
            play.stop = -1;
            play.abcplay?.stop();
        }
        return;
    }

    // Search a symbol to play
    function gnrn(sym: any, loop?: boolean): any {	// Go to the next real note (not tied)
        let i: number;
        while (true) {
            switch (sym.type) {
                case C.NOTE:
                    i = sym.nhd + 1;
                    while (--i >= 0) {
                        if (sym.notes[i].ti2)
                            break;
                    }
                    if (i < 0)
                        return sym;
                    break;
                case C.REST:
                case C.GRACE:
                    return sym;
                case C.BLOCK:
                    switch (sym.subtype) {
                        case "midictl":
                        case "midiprog":
                            return sym;
                    }
                    break;
            }
            if (!sym.ts_next) {
                if (!loop)
                    return gprn(sym, true);
                return sym;
            }
            sym = sym.ts_next;
        }
    }

    function gprn(sym: any, loop?: boolean): any {	// Go to the previous real note (not tied)
        let i: number;
        while (true) {
            switch (sym.type) {
                case C.NOTE:
                    i = sym.nhd + 1;
                    while (--i >= 0) {
                        if (sym.notes[i].ti2)
                            break;
                    }
                    if (i < 0)
                        return sym;
                    break;
                case C.REST:
                case C.GRACE:
                    return sym;
                case C.BLOCK:
                    switch (sym.subtype) {
                        case "midictl":
                        case "midiprog":
                            return sym;
                    }
                    break;
            }
            if (!sym.ts_prev) {
                if (!loop)
                    return gnrn(sym, true);
                return sym;
            }
            sym = sym.ts_prev;
        }
    }

    function gsot(si: number): any {		// Go to the first symbol of a tune
        let sym = syms[si].p_v.sym;

        while (!sym.seqst)
            sym = sym.ts_prev;
        return sym;
    }

    function get_se(si: number): any {			// Get the starting symbol
        let sym = syms[si];

        while (!sym.seqst)
            sym = sym.ts_prev;
        return sym;
    }

    function get_ee(si: number): any {			// Get the ending symbol
        let sym = syms[si];

        while (sym.ts_next && !sym.ts_next.seqst)
            sym = sym.ts_next;
        return sym;
    }

    // Start playing
    function play_start(si: any, ei: any): void {
        if (!si)
            return;
        selx_sav[0] = selx[0];		// Remove the colors
        selx_sav[1] = selx[1];
        setsel(0, 0);
        setsel(1, 0);

        play.stop = 0;
        play.abcplay?.play(si, ei, play.repv);
    }

    play.playing = true;
    if (tunes != abc.tunes) {		// If new display
        tunes = abc.tunes;

        // Generate the play data of all tunes
        for (let i = 0; i < tunes.length; i++) {
            const elt = tunes[i];
            play.abcplay?.add(elt[0], elt[1], elt[3]);
        }

        play.si = play.ei = null;
        play.stop = 0;
        play.loop = false;
    }

    // If loop again
    if (what == 2 && play.loop) {
        play_start(play.si, play.ei);
        return;
    }

    // Get the starting and ending play indexes, and start playing
    let si, ei;

    if (what == 3 && play.stop && play.stop > 0) {	// If stopped and continue
        play_start(get_se(play.stop), play.ei);
        return;
    }
    
    if (what != 0 && selx[0] && selx[1]) {	// If full selection
        si = get_se(selx[0]);
        ei = get_ee(selx[1]);
    } else if (what != 0 && selx[0]) {	// If selection without end
        si = get_se(selx[0]);
        ei = null;
    } else if (what != 0 && selx[1]) {	// If selection without start
        si = gsot(selx[1]);
        ei = get_ee(selx[1]);
    } else {				// No selection => tune
        // TODO: use the class name of the clicked element to get the tune number
        /* elt = play.click.svg		// (dummy)
        si = elt.getAttribute('class') */

        si = 'tune0'; // Dummy for tests
        const siMatch = /tune(\d*)/.exec(si);
        if (!siMatch) {
            play.playing = false;
            return;			// No tune here
        }
        si = tunes[parseInt(siMatch[1], 10)][0];		// First symbol of the tune
        ei = si;
        while (ei && !ei.dur)
            ei = ei.ts_next;
        if (!ei) {
            play.playing = false;
            return;			// Nothing to play
        }
        ei = null;
    }

    if (what != 3) {		// If not continue
        play.si = si;
        play.ei = ei;
        play.loop = what == 2;
        play.repv = 0;
    }

    play_start(si, ei);
}

// Set/clear a selection
function setsel(idx: number, v: number): void {
    const old_v = selx[idx];

    if (v == old_v)
        return;
        
    if (old_v) {
        const elts = document.getElementsByClassName('_' + old_v + '_');
        let i = elts.length;
        while (--i >= 0)
            (elts[i] as HTMLElement).style.fillOpacity = '0';
    }
    
    if (v) {
        const elts = document.getElementsByClassName('_' + v + '_');
        let i = elts.length;
        while (--i >= 0)
            (elts[i] as HTMLElement).style.fillOpacity = '0.4';
    }

    selx[idx] = v;
}

// Playing is finished
function endplay(repv?: number): void {
    if (play.loop && play.abcplay) {
        play.abcplay.play(play.si, play.ei);
        return;
    }
    
    play.playing = false;
    play.repv = repv || 0;		// Repeat variant number for continue

    // Redisplay the selection
    selx[0] = selx[1] = 0;
    setsel(0, selx_sav[0]);
    setsel(1, selx_sav[1]);
}