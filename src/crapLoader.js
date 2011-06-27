/**
 * Copyright (c) 2011 Gregers Rygg
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

var adLoader = (function() {
    var initialized = false
        ,queue = []
        ,inputBuffer = []
        ,writeBuffer = {}
        ,chunkBuffer
        ,loading = 0
        ,elementCache = {}
        ,splitScriptsRegex = /(<script[^>]+src=['"]?[^'"\s]+[^>]*>\s*<\/script>)/gim
        ,externalScriptSrcRegex = /<script[^>]+src=['"]?([^'"\s]+)[^>]*>\s*<\/script>/im
        ,globalOptions = {
            loadSequentially: false,
            printTree: false
        }
        ,defaultOptions = {
            async: false,
            charset: "utf-8",
            success: undefined
        },priv,publ
        ,splitWithCapturingParenthesesWorks = ("abc".split(/(b)/)[1]==="b");


    priv = {
        checkQueue: function() {
            if(queue.length) {
                priv.loadScript( queue.shift() );
            }
        },

        checkWriteBuffer: function(obj) {
            var buffer = writeBuffer[obj.domId];

            if(buffer && buffer.length) {
                priv.writeHtml( buffer.shift(), obj );

            } else {
                priv.finished(obj);
            }
        },

        extend: function(t, s) {
            if(!s) return t;
            for(var k in s) {
                t[k] = s[k];
            }
            return t;
        },

        finished: function(obj) {
            if(obj.success && typeof obj.success == "function") {
                obj.success.call(obj.domId);
            }

            priv.checkQueue();
        },

        flush: function(obj) {
            var domId = obj.domId
               ,outputFromScript
               ,htmlPartArray;

            outputFromScript = this.stripNoScript( inputBuffer.join("") );
            inputBuffer = [];

            htmlPartArray = priv.separateScriptsFromHtml( outputFromScript );


            if(!writeBuffer[domId]) {
                writeBuffer[domId] = htmlPartArray;
            } else {
                Array.prototype.unshift.apply(writeBuffer[domId], htmlPartArray);
            }
            priv.checkWriteBuffer(obj);
        },

        getElById: function(domId) {
            return elementCache[domId] || (elementCache[domId] = document.getElementById(domId));
        },

        getElementByIdReplacement: function(domId) {
            var el = publ.orgGetElementById.call(document, domId);
            if(el) return el;
            if(inputBuffer.length) {
                var before = new Date().getTime();
                var html = inputBuffer.join("");
                var frag = document.createDocumentFragment();
                var div = document.createElement("div");
                div.innerHTML = html;
                frag.appendChild(div);
                var found = traverseForElById(domId, div);
                var after = new Date().getTime();
                return found;
            }

            function traverseForElById(domId, el) {
                var children = el.children;
                if(children && children.length) {
                    for(var i=0,l=children.length; i<l; i++) {
                        var child = children[i];
                        if(child.id && child.id === domId) return child;
                        if(child.children && child.children.length) return traverseForElById(child);
                    }
                }
            }
        },

        loadScript: function(obj) {
            loading++;
            // async loading code from jQuery
            var head = document.getElementsByTagName("head")[0] || document.documentElement
               ,script = document.createElement("script");
            script.type = "text/javascript";
            script.charset = obj.charset;

            if(globalOptions.printTree) {
                priv.printScriptSrc(obj);
            }

            var done = false;
            // Attach handlers for all browsers
            script.onload = script.onreadystatechange = function() {
                loading--;
                script.loaded = true;
                if ( !done && (!this.readyState ||
                        this.readyState === "loaded" || this.readyState === "complete") ) {
                    done = true;
                    script.onload = script.onreadystatechange = null;
                    
                    priv.flush(obj);
                }
            };

            script.loaded = false;
            script.src = obj.src;
            obj.depth++;

            // Use insertBefore instead of appendChild  to circumvent an IE6 bug.
            // This arises when a base node is used (#2709 and #4378).
            head.insertBefore( script, head.firstChild );
            setTimeout(function() {
                if(!script.loaded) throw new Error("SCRIPT NOT LOADED: " + script.src);
            }, 3000);
        },

        printScriptSrc: function(obj) {

        },

        separateScriptsFromHtml: function(htmlStr) {
            return priv.split(htmlStr, splitScriptsRegex);
        },

        split: function(str, regexp) {
            var match, prevIndex=0, tmp, result = [];

            if(false && splitWithCapturingParenthesesWorks) {
                tmp = str.split(regexp);
            } else {
                // Cross browser split technique from Steven Levithan
                // http://blog.stevenlevithan.com/archives/cross-browser-split
                tmp = [];
                while(match = regexp.exec(str)) {
                    if(match.index > prevIndex) {
                        result.push(str.slice(prevIndex, match.index));
                    }

                    if(match.length > 1 && match.index < str.length) {
                        Array.prototype.push.apply(tmp, match.slice(1));
                    }

                    prevIndex = regexp.lastIndex;
                }

                if(prevIndex < str.length) {
                    tmp.push(str.slice(prevIndex));
                }

            }

            for(var i=0, l=tmp.length; i<l; i=i+1) {
                if(tmp[i]!=="") result.push(tmp[i]);
            }

            return result;
        },
        
        stripNoScript: function(html) {
            return html.replace(/<noscript>.*?<\/noscript>/ig, "");
        },
        
        trim: function(str) {
            return str.replace(/^\s*|\s*$/gim, "");;
        },

        writeHtml: function(html, obj) {
            var scriptMatch = html.match(externalScriptSrcRegex);
            if(scriptMatch && scriptMatch.length == 2) {
                var scriptSrc = scriptMatch[1];
                obj.src = scriptSrc;
                priv.loadScript(obj);
            } else {
                var container = priv.getElById(obj.domId);
                if(!container) throw new Error("adLoader: Unable to inject html. Element with id '" + obj.domId + "' does not exist");
                html = this.trim(html); // newline before <object> cause weird effects in IE
                if(html) container.innerHTML += html;
                priv.checkWriteBuffer(obj);
            }
        },

        writeReplacement: function(str) {
            inputBuffer.push(str);

        }

    };

    publ = {
        hijack: function(options) {
            if(initialized) return;
            initialized = true;
            priv.extend(globalOptions, options);

            document.write = document.writeln = priv.writeReplacement;
            document.getElementById = priv.getElementByIdReplacement;
        },

        release: function() {
            document.write = this.orgWrite;
            document.writeln = this.orgWriteLn;
            document.getElementById = this.orgGetElementById;
        },

        loadScript: function(src, domId, options) {
            var defaultOptsCopy = priv.extend({}, defaultOptions);
            var obj = priv.extend(defaultOptsCopy, options);
            obj.src = src;
            obj.domId = domId;
            obj.depth = 0;

            if(globalOptions.loadSequentially) {
                queue.push(obj);
                setTimeout(function() {
                    if(loading === 0) priv.checkQueue();
                }, 1);
            } else {
                setTimeout(function() {
                    priv.loadScript(obj);
                }, 1);
            }
        },

        orgGetElementById: document.getElementById,
        orgWrite: document.write,
        orgWriteLn: document.writeln
     };

    return publ;
})();

if(typeof define === "function") {
    define("crapLoader",  function() {
        var crapLoader = window.crapLoader;
        delete window.crapLoader;
        return crapLoader;
    });
}
