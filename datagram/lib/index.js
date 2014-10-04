/*jslint node: true */

"use strict";

var fs = require("fs"),
    crypto = require('crypto'),
    undscore = require('underscore'),
    jschardet = require('jschardet'),
    Pool = require('generic-pool').Pool;

// Fall-back on iconv-lite
var iconv, iconvLite;
try {
    iconv = require('iconv').Iconv;
} catch (ignore) {}

if (!iconv) {
    iconvLite = require('iconv-lite');
}


exports.VERSION = "0.0.2";

exports.datagram = function (options) {

    var self = this,
        masterOnlyOptions = ["maxConnections", "priorityRange", "onDrain"], // Don't make these options persist to individual queries
        plannedQueueCallsCount = 0,
        queuedCount = 0;

    self.languages = {};

    //Default options
    self.options = undscore.extend({
        DEFAULT_DATASETS: ['french', 'english'],
        DEFAULT_DATASETS_DIR: './LM/',
        DEFAULT_DATASETS_EXT: '.lm',
        DEFAULT_INPUT: 'string', //  string, file
        DEFAULT_MODE: 'classify', // classify, profilize
        ngramMIN: 3,
        ngramMAX: 10,
        ngramPerSet: 250,
        maxConnections: 10,
        priorityRange: 10,
        forceUTF8: true,
        onDrain: false,
        debug: false,
        onDebug: false
    }, options);

    //Setup a worker pool w/ https://github.com/coopernurse/node-pool
    self.pool = new Pool({
        name: 'datagram',
        //log        : self.options.debug,
        max: self.options.maxConnections,
        priorityRange: self.options.priorityRange,
        create: function (callback) {
            callback(1);
        },
        destroy: function (client) {
            client.end();
        }
    });

    var release = function (opts) {

        queuedCount = queuedCount - 1;
        // self.options.onDebug("Released... count",queuedCount,plannedQueueCallsCount);
        //if (opts._poolRef) {
        //    self.pool.release(opts._poolRef);
        //}
        // Pool stats are behaving weird - have to implement our own counter

        if (queuedCount + plannedQueueCallsCount === 0) {
            if (self.options.onDrain) {
                self.options.onDrain();
                return;
            }
        }
    };

    self.onDrain = function () {
    };
    self.onDebug = function (data, addon) {  };
    /**
     * Reads datasets from DEFAULT_DATASETS option to object
     * @param {string} file-name of dataset in directory if FALSE reads whole directory and uses all available sets.
     */
    self.readDataSet = function (dataset) {
        var CategorizationDataSet = "";
        if (self.options.DEFAULT_DATASETS !== false) {
            CategorizationDataSet = self.options.DEFAULT_DATASETS_DIR + dataset + self.options.DEFAULT_DATASETS_EXT;
        } else {
            CategorizationDataSet = self.options.DEFAULT_DATASETS_DIR + dataset;
        }
        if (fs.existsSync(CategorizationDataSet)) {
            var data = fs.readFileSync(CategorizationDataSet, 'utf8');
            if (self.options.debug) {
                self.options.onDebug("Processing categorization file: " + dataset, null);
            }
            self.languages[dataset] = JSON.parse(data);
        } else {

            self.options.onDebug("Categorization file not found: " + CategorizationDataSet, null);
        }
        if (self.options.debug) {
            self.options.onDebug(CategorizationDataSet, null);
        }
    };

    /**
     * Goes through the given directory to return all files and folders recursively
     * @param {string} folder Folder location to search through
     * @returns {object} Nested tree of the found files
     */
    self.getFilesRecursive = function () {
        var fileContents = fs.readdirSync(self.options.DEFAULT_DATASETS_DIR),
            fileTree = [];

        fileContents.forEach(function (fileName) {
            fileTree.push(fileName);
            //stats = fs.lstatSync(folder + '/' + fileName);

            //if (stats.isDirectory()) {
            //  fileTree.push({
            //      name: fileName,
            //      children: getFilesRecursive(folder + '/' + fileName)
            //  });
            //} else {
            //  fileTree.push({
            //      name: fileName
            //  });
            //}
        });

        return fileTree;
    };

    if (self.options.debug) {
        self.options.onDebug('*****************************', null);
    }
    // Are we in classify or profilize mode?
    if (self.options.DEFAULT_MODE === 'classify') {
        if (self.options.DEFAULT_DATASETS !== false) {
            self.options.onDebug("Dataset is specified.. using those!", null);
            self.options.DEFAULT_DATASETS.forEach(function (value, index, ar) {
                self.readDataSet(value);
            });

        } else {
            self.options.onDebug("Using all available datasets!", null);
            var categorizationDatasets = self.getFilesRecursive();
            categorizationDatasets.forEach(function (value, index, ar) {
                self.readDataSet(value);
            });
        }
    } // Mode Check
    if (self.options.debug) {
        self.options.onDebug('*****************************', null);
    }
    /**
     * Reads queued file or string into object for further analyzing and starts onContent() funct
     * @param {object} request options
     */
    self.request = function (opts) {
        var response = {};
        if (opts.DEFAULT_INPUT === 'file') {

            fs.readFile(opts.uri, function (error, data) {
                if (error) {
                    throw error;
                }
                
                response.data = data;

                self.onContent(null, opts, response);
            });

        } else if (opts.DEFAULT_INPUT === 'string') {
            response.data = opts.uri;
            self.onContent(null, opts, response);
        }
    };
    /**
     * Try to convert input request data to utf8 and string
     * @param {data} data
     */
    self.ForceToUTF8 = function (data) {
        // https://github.com/aadsm/jschardet
        var detected = jschardet.detect(data);

        if (detected && detected.encoding) {

            self.options.onDebug("Detected charset " + detected.encoding + " (" + Math.floor(detected.confidence * 100) + "% confidence)", null);

            if (detected.encoding !== "utf-8" && detected.encoding !== "ascii") {

                if (iconv) {
                    var iconvObj = new iconv(detected.encoding, "UTF-8//TRANSLIT//IGNORE");
                    data = iconvObj.convert(data).toString();

                    // iconv-lite doesn't support Big5 (yet)
                } else if (detected.encoding !== "Big5") {
                    data = iconvLite.decode(data, detected.encoding);
                }

            } else if (typeof data !== "string") {
                data = data.toString();
            }

        } else {
            data = data.toString("utf8"); //hope for the best
        }

        return data;
    };
    /**
     * Starts Rating or Classifying process after input-data is prepared
     * @param {error} error
     * @param {toQueue} options object
     * @param {response} input data
     */
    self.onContent = function (error, toQueue, response) {

        if (!toQueue.callback) {
            return release(toQueue);
        }

        if (toQueue.forceUTF8) {
            response.data = self.ForceToUTF8(response.data);
        } else {
            response.data = response.data.toString();
        }

        response.options = toQueue;

        if (response.options.DEFAULT_MODE === 'classify') {
            if (response.options.debug) {
                response.options.onDebug("Step 2: Starting Dataset classify process..", response.options);
            }

            response.data = self.dataCleaners(response);

            response.classify = {};
            response.classify.rating = self.rateInput(response);
            response.classify.guess = self.guessDataSet(response.classify.rating);
            response.classify.finalGuess = response.classify.guess[0];

        } else if (response.options.DEFAULT_MODE === 'profilize') {
            if (response.options.debug) {
                response.options.onDebug("Step 2: Starting Dataset profilize process..", response.options);
            }
            response.data = JSON.parse(response.data);
            response.profilize = {};
            response.profilize.output = self.Profilize(response);

        } else {
            response.options.onDebug('Error: undetected mode!', response.options);

        }

        response.options.callback(null, response);
        release(toQueue);

    };

    self.Profilize = function (response) {

        var output = {},
            set_counter = 1;

        response.data.forEach(function (dataset) {
            var Profilize = {};
            Profilize.main_category = dataset.main_category;
            Profilize.file_name = dataset.file_name;
            Profilize.sub_category = dataset.sub_category;
            Profilize.ngrams = {};

            if (dataset.enabled === true) {
                self.options.onDebug("************************************", null);
                self.options.onDebug("Profilizing: " + Profilize.file_name + ' ' + set_counter + ' of ' + response.data.length + ' sets!', null);
                self.options.onDebug("************************************", null);

                dataset.training_sets.forEach(function (dataset) {

                    self.options.onDebug('-> ' + dataset.uri, null);
                    dataset.options = response.options;

                    var full_dataset_uri = './samples/profilize/' + dataset.uri,
                        i = dataset.options.ngramMIN,
                        grams_extracted,
                        grams_trimmed;

                    if (fs.existsSync(full_dataset_uri)) {

                        dataset.data = fs.readFileSync(full_dataset_uri);

                        if (dataset.options.forceUTF8) {
                            // Try to convert data to utf8
                            dataset.data = self.ForceToUTF8(dataset.data);
                        }

                        while (i <= dataset.options.ngramMAX) {
                            self.options.onDebug("Profilazing subset for " + i + " ngrams!", null);
                            // Extract all grams for length i from training data
                            grams_extracted = self.ngramCounter(dataset, i);
                            // Sort grams and trim to length of i
                            grams_trimmed = self.ngramTrimmer(grams_extracted, i);

                            Profilize.ngrams[i] = grams_trimmed;

                            i = i + 1;
                        }
                    } else {
                        self.options.onDebug('Dataset not found on system...skipping...', null);
                    }
                });

                output[Profilize.file_name] = self.saveDataSetNgrams(Profilize);
            } else {
                self.options.onDebug("************************************", null);
                self.options.onDebug("SKIPPING: " + Profilize.file_name + ' ' + set_counter + ' of ' + response.data.length + ' sets!', null);
                self.options.onDebug("************************************", null);
            }
            set_counter = set_counter + 1;

        });


        return output;
    };

    self.saveDataSetNgrams = function (data) {

        var outputFilename = self.options.DEFAULT_DATASETS_DIR + data.file_name + self.options.DEFAULT_DATASETS_EXT,
            json_data = JSON.stringify(data),
            stream;

        stream = fs.createWriteStream(outputFilename, {
            encoding: 'utf8'
        });
        stream.once('open', function (fd) {
            stream.write(json_data);
            stream.end();
        });

        return outputFilename;
    };

    self.dataCleaners = function (dataset) {
        var data = dataset.data;
        if(dataset.options.DEFAULT_MODE === 'profilize'){
            if (dataset.analyzer === 'dictionary' && dataset.type === 'text') {
                // remove all non "word" characters
                data = data.replace(/\P{wd}+/, ' ');
                // remove all words that contain numbers
                data = data.replace(/\b[^\s]*\d[^\s]*\b/g, '');
                // remove all newlines
                data = data.replace(/(\r\n|\n|\r)/gm, ' ');
                // remove extra whitespace
                data = data.replace(/\s\s+/, ' ');
                // Add each word to array
                data = data.split(' ');

            }
        }else if(dataset.options.DEFAULT_MODE === 'classify'){
                // remove all non "word" characters
                data = data.replace(/\P{wd}+/, ' ');
                // remove all words that contain numbers
                data = data.replace(/\b[^\s]*\d[^\s]*\b/g, '');
                // remove all newlines
                data = data.replace(/(\r\n|\n|\r)/gm, ' ');
                // remove extra whitespace
                data = data.replace(/\s\s+/, ' ');
                // remove word smaller then ngramMIN
                data = data.split(/\s+/).filter(function(token){ 
                    return token.length > dataset.options.ngramMIN;
                }).join(' ');
        }

        return data;
    };

    self.ngramIritator = function (dataset, gramSize) {

        // clean input data based on "analyzer" value
        var simplified = self.dataCleaners(dataset),
            lenDiff = 0,
            results = [],
            index, gram_value, gram_lenght, i, gram;

        // If preprepared input is array loop each value for n-grams
        if (undscore.isArray(simplified) === true) {
            for (index in simplified) {

                if(simplified[index] !== null){

                    gram_value = simplified[index];
                    gram_lenght = gram_value.length;
                    lenDiff = gramSize - gram_lenght;

                    for (i = 0; i < gram_lenght - gramSize + 1; ++i) {
                        gram = gram_value.slice(i, i + gramSize);
                        results.push(gram);
                    }
                } // if index exists
            }

        } else {

            gram_lenght = simplified.length;
            lenDiff = gramSize - gram_lenght;

            if (lenDiff > 0) {
                for (i = 0; i < lenDiff; ++i) {
                    simplified += '-';
                }
            }

            for (i = 0; i < simplified.length - gramSize + 1; ++i) {
                gram = simplified.slice(i, i + gramSize);
                results.push(gram);
            }
        }

        return results;
    };
    self.ngramCounter = function (dataset, gramSize) {
        // return an object where key=gram, value=number of occurrences
        var result = {},
            grams = self.ngramIritator(dataset, gramSize),
            i = 0;
        for (i; i < grams.length; ++i) {
            if (grams[i] in result) {
                result[grams[i]] += 1;
            } else {
                result[grams[i]] = 1;
            }
        }
        return [result, i];
    };
    self.ngramTrimmer = function (grams, i) {
        var grams_sorted = self.helpArraySort(grams[0]);

        var grams_per_set = 0;
        var sliced_grams = {};

        if (self.options.ngramPerSet > grams[1]) {
            grams_per_set = grams[1];
        } else {
            grams_per_set = self.options.ngramPerSet;
        }

        var ngram_limit_count = 0;
        for (var gram_key in grams_sorted) {
            if (ngram_limit_count < grams_per_set) {
                sliced_grams[gram_key] = grams_sorted[gram_key];
                ngram_limit_count++;
            }
        }

        return sliced_grams;
    };

    // helper functions
    self.levenshtein = function (str1, str2) {
        var current = [],
            prev, value;

        for (var i = 0; i <= str2.length; i++){
            for (var j = 0; j <= str1.length; j++) {
                if (i && j){
                    if (str1.charAt(j - 1) === str2.charAt(i - 1)){
                        value = prev;
                    }else{
                        value = Math.min(current[j], current[j - 1], prev) + 1;
                    }
                }else{
                    value = i + j;
                }

                prev = current[j];
                current[j] = value;
            }
        }

        return current.pop();
    };
    // return an edit distance from 0 to 1
    self.ngramDistance = function (str1, str2) {
        if (str1 === null && str2 === null){ throw 'Trying to compare two null values'; }
        if (str1 === null || str2 === null){ return 0; }
        
        str1 = String(str1);
        str2 = String(str2);

        var distance = self.levenshtein(str1, str2);
        if (str1.length > str2.length) {
            return 1 - distance / str1.length;
        } else {
            return 1 - distance / str2.length;
        }
    };

    self.rateInput = function (response) {
        var Categorize = {},
            time_start_set = +new Date(), time_end_set, time_start_partial, time_end_partial,            
            rating_total = 0,
            special_patt = /^[ -~]+$/,
            dataset, ngram_set, key, ngramKey, ngramKeyValue, countForKey;


        // Data to process
        Categorize.data = response.data;

        Categorize.count = {};
        Categorize.count.detail = {};
        Categorize.count.basic = {};

        for (dataset in self.languages) {

            rating_total = 0;
            ngram_set = self.languages[dataset];

            Categorize.count.detail[dataset] = {
                rating: {}
            };
            time_start_partial = +new Date();
            // Lets do basic preg_match count of ngrams 
            for (key in ngram_set.ngrams) {
                // Set initial value        
                if (ngram_set.ngrams.hasOwnProperty(key)) {
                    Categorize.count.detail[dataset].rating[key] = 1;
                    //self.options.onDebug('Analyzing dataset: ' + dataset + ' ngram: ' + key, null);
                    for (ngramKey in ngram_set.ngrams[key]) {
                        //self.options.onDebug(key + ' --> ' + ngramKey + ' -- ' + ngram_set.ngrams[key][ngramKey], null);

                        countForKey = self.helpSubstrCount(Categorize.data, ngramKey);

                        if (countForKey !== 0) {
                            if (special_patt.test(ngramKey) === false ) {
                                ngramKeyValue = (ngram_set.ngrams[key][ngramKey] * key) * Math.pow(ngramKey.length, ngramKey.length);
                            }else{
                                ngramKeyValue = (ngram_set.ngrams[key][ngramKey] * key);
                            }
                            //self.options.onDebug(dataset + '-> ' + ngramKey + ' - - ' + countForKey, null);
                            Categorize.count.detail[dataset].rating[key] += (countForKey * ngramKeyValue);

                            rating_total += Categorize.count.detail[dataset].rating[key];
                        }
                    }

                    

                } // If end

            } // For end

            //Categorize.count[dataset].rating = self.helpArraySort(Categorize.count[dataset].rating);     
            Categorize.count.basic[dataset] = rating_total;
            time_end_partial = +new Date();
            self.options.onDebug("Processing dataset: \"" + dataset + "\" done in: " + (time_end_partial - time_start_partial) + " ms", response.options);
        }

        time_end_set = +new Date();
        self.options.onDebug("All datasets finished in: " + (time_end_set - time_start_set) + " ms", response.options);

        return Categorize.count;
    };
    self.guessDataSet = function (counts) {

        var cross_compare = self.crossCompare(counts.detail);
        cross_compare = self.helpArraySort(cross_compare);
        var guessGrades = self.helpArrayKeys(cross_compare);

        //counts.basic = self.helpArraySort(counts.basic);
        //var guessGrades = self.helpArrayKeys(counts.basic);

        return guessGrades;
    };

    self.crossCompare = function (obj) {

        var key, a_country, b_country, a_rating, b_rating, a_val, b_val, point;
        var results = {};

        for (a_country in obj) {
            results[a_country] = 0;
            a_rating = obj[a_country].rating;
            for (b_country in obj) {
                if (a_country === b_country) continue; // Don't compare country with itself
                b_rating = obj[b_country].rating;
                for (key in a_rating) {
                    a_val = a_rating[key];
                    b_val = b_rating[key];
                    point = a_val > b_val; // Country A wins (true) or not (false)
                    if (point) results[a_country] += 1;
                }
            }
        }
        return results;
    };

    self.helpSubstrCount = function (x, c) {
        var t=0, l=0;
        c=c+'';
        while (!!(l = x.indexOf(c,l) +1) ) {
            ++t;
        }
        return t;
    };

    /* Sort an array in reverse order and maintain index association
     * @param {inputArr} The input array
     * @param {sort_flags}  SORT_REGULAR - compare items normally (don't change types)
     *                      SORT_NUMERIC - compare items numerically
     *                      SORT_STRING - compare items as strings
     */
    self.helpArraySort = function (inputArr, sort_flags) {
        var valArr = [],
            valArrLen = 0,
            k, i, sorter, that = this,
            populateArr = {};

        switch (sort_flags) {
        case 'SORT_STRING':
            // compare items as strings
            sorter = function (a, b) {
                return that.strnatcmp(b, a);
            };
            break;
        case 'SORT_NUMERIC':
            // compare items numerically
            sorter = function (a, b) {
                return (a - b);
            };
            break;
        default:
            sorter = function (b, a) {
                var aFloat = parseFloat(a),
                    bFloat = parseFloat(b),
                    aNumeric = aFloat + '' === a,
                    bNumeric = bFloat + '' === b;
                if (aNumeric && bNumeric) {
                    return aFloat > bFloat ? 1 : aFloat < bFloat ? -1 : 0;
                } else if (aNumeric && !bNumeric) {
                    return 1;
                } else if (!aNumeric && bNumeric) {
                    return -1;
                }
                return a > b ? 1 : a < b ? -1 : 0;
            };
            break;
        }

        // Get key and value arrays
        for (k in inputArr) {
            if (inputArr.hasOwnProperty(k)) {
                valArr.push([k, inputArr[k]]);
            }
        }
        valArr.sort(function (a, b) {
            return sorter(a[1], b[1]);
        });

        // Repopulate the old array
        for (i = 0, valArrLen = valArr.length; i < valArrLen; i++) {
            populateArr[valArr[i][0]] = valArr[i][1];
        }

        return populateArr;
    };

    self.helpArrayKeys = function (input, search_value, argStrict) {
        //   example 1: helpArrayKeys( {firstname: 'Kevin', surname: 'van Zonneveld'} );
        //   returns 1: {0: 'firstname', 1: 'surname'}

        var search = typeof search_value !== 'undefined',
            tmp_arr = [],
            strict = !!argStrict,
            include = true,
            key = '';

        for (key in input) {
            if (input.hasOwnProperty(key)) {
                include = true;
                if (search) {
                    if (strict && input[key] !== search_value) {
                        include = false;
                    } else if (input[key] !== search_value) {
                        include = false;
                    }
                }

                if (include) {
                    tmp_arr[tmp_arr.length] = key;
                }
            }
        }

        return tmp_arr;
    };


    self.queue = function (item, additional) {
        var item_hash;
        //Did we get a list ? Queue all the URLs.
        if (undscore.isArray(item)) {
            for (var i = 0; i < item.length; i++) {
                self.queue(item[i]);
            }
            return;
        }

        queuedCount++;

        var toQueue = item;

        //Allow passing just strings as Inputs
        if (undscore.isString(item)) {
            item_hash = crypto.createHash('md5').update(item).digest('hex');

            toQueue = {
                "uri": item,
                "hash": item_hash,
                "addon": additional
            };

            undscore.defaults(toQueue, self.options);

            if (self.options.DEFAULT_INPUT === 'file') {
                if (fs.existsSync(item) === false) {
                    self.options.onDebug("Input file not found: " + item, toQueue);
                    return;
                }
            } else if (self.options.DEFAULT_INPUT === 'string') {
                self.options.onDebug("Reading input as string.", toQueue);
            } else {
                self.options.onDebug("Unsupported input method: ", toQueue);
                return;
            }
        } else {
            self.options.onDebug("Only string inputs are allowed! skipping...", toQueue);
            return;
        }

        // Cleanup options
        undscore.each(masterOnlyOptions, function (o) {
            delete toQueue[o];
        });

        // If duplicate skipping is enabled, avoid queueing entirely for URLs we already crawled
        if (toQueue.skipDuplicates && self.cache[toQueue.uri]) {
            return release(toQueue);
        }

        self.pool.acquire(function (err, poolRef) {

            //TODO - which errback to call?
            if (err) {
                console.error("Pool acquire error:", err);
                return release(toQueue);
            }

            toQueue._poolRef = poolRef;

            // We need to check again for duplicates because the cache might have
            // been completed since we queued self task.
            if (toQueue.skipDuplicates && self.cache[toQueue.uri]) {
                return release(toQueue);
            }

            //Make a request
            if (typeof toQueue.uri === "function") {
                toQueue.uri(function (uri) {
                    toQueue.uri = uri;
                    self.request(toQueue);
                });
            } else {
                self.request(toQueue);
            }

        }, toQueue.priority);
    };

};