const vscode = acquireVsCodeApi();
let play = {};
let abc;
let user;

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
        onend: () => console.log("Playback ended"),
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

// implement playback
document.getElementById('play-button').addEventListener('click', () => {
    console.log('clicked on play');
    if (play.abcplay) {
        console.log('launching play');
        console.log(abc.tunes);

        // Get the start and end of the tune
        const symbols = abc.tunes[2]; // Assuming the first tune
        const startSymbol = symbols[0]; // First symbol of the tune
        const endSymbol = symbols[symbols.length - 1]; // Last symbol of the tune

        // Play the tune from start to end
        play.abcplay.play(startSymbol, endSymbol);
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