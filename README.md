## Introduction
`datagram` is JS classification library it can automatically classify and recognize text documents using n-grams method. 
That is sometime useful in Computational linguistics as-well as in other scientific fields.
Its was primarily developed for language guessing but not limited to it.

Algorithm is based on the classification technique described in Cavnar & Trenkle, "N-Gram-Based Text Categorization". (http://www.let.rug.nl/vannoord/TextCat/textcat.pdf)

## How to create your own datasets?

creating your own datasets can be useful for categorizing text into topics.
Data should be at much of data as you can get in order to get useful datasets.

Just set in options:

```
DEFAULT_MODE: 'profilize'
```
and see "../samples/profilize/index.json" for example

```javascript
var options = {
    DEFAULT_DATASETS: ['English', 'German', 'French', 'Polish', 'Italian', 'Croatian'],
    DEFAULT_DATASETS_DIR: './datagram/LM/',
    DEFAULT_DATASETS_EXT: '.lm',
    DEFAULT_INPUT: 'string', // string, file
    DEFAULT_MODE: 'profilize', // classify, profilize
    debug: false,
    callback: function (error, result) {
        return new datagramProcessed(error, result);
    },
    onDrain: function () {
        return new datagramDone();
    },
    onDebug: function (data, addon) {
        return new datagramDebug(data, addon);
    }
};

var dg = new datagram(options);
// To make Dataset Profiles
//tc.queue(../samples/profilize/index.json);
```


## Support and Bugs
If you are having trouble, have found a bug, or want to contribute don't be shy.

[Open a ticket](https://github.com/LogIN-/datagram/issues) on GitHub.

## License
`datagram` source-code uses the The MIT License (MIT), see our `LICENSE` file.
```
The MIT License (MIT)
Copyright (c) LogIN- 2014
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```