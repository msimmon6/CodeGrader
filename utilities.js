// UTILITY FUNCTIONS & CLASSES


class TypeInformation {
    constructor() {
        /** @type {Array.<MethodCall>}*/
        this.methodCalls = [];
        /** @type {Array.<Declaration>}*/
        this.declarations = [];
        this.scopes = [];
        this.ternaryExpressions = [];
        this.binaryExpressions = [];
        this.unaryExpressions = [];
        this.assignments = [];
        /** @type {Array.<Usage>}*/
        this.usages = [];
        this.typeScope = null;
    }
}

class CodeFile {
    constructor(filename, sourceCode, trCodeLines, abstractSyntaxTree, parseError, fromLineIndex, toLineIndex) {
        this.filename = filename;
        this.sourceCode = sourceCode;
        this.codeLines = sourceCode.split("\n");
        this.codeLineLengths = this.codeLines.map(codeLine => codeLine.length);
        let offset = 0;
        /** @type {Array.<Number>}*/
        this.lineStartOffsets = [];
        /** @type {Array.<Number>}*/
        this.lineEndOffsets = [];
        $.each(this.codeLineLengths, (iLine, length) => {
            this.lineStartOffsets.push(offset);
            offset += length;
            this.lineEndOffsets.push(offset);
        });
        this.trCodeLines = trCodeLines;
        this.abstractSyntaxTree = abstractSyntaxTree;
        this.parseError = parseError;
        this.fromLineIndex = fromLineIndex;
        this.toLineIndex = toLineIndex;

        /**@type {Map.<string, TypeInformation>}*/
        this.types = new Map();
    }
}

function getLineIndexFromOffset(lineStartOffsets, offset) {
    for (let iLine = 0; iLine < lineStartOffsets.length; iLine++) {

    }
}

function parseJavaCode(fileCode) {
    let abstractSyntaxTree = null;
    let parseError = null;
    try {
        // relies on https://github.com/Algomorph/jsjavaparser
        abstractSyntaxTree = JavaParser.parse(fileCode);
    } catch (err) {
        parseError = err;
    }
    return [abstractSyntaxTree, parseError]
}

function readCodeFilesFromServer(fileDescriptors, callback) {
    const fileCount = fileDescriptors.length;
    let processedCount = 0;
    let codeFiles = new Map();

    for (const descriptor of fileDescriptors) {
        $.get(
            descriptor.url,
            function (data) {
                const currentDescriptor = fileDescriptors[processedCount];
                // relies on https://github.com/Algomorph/jsjavaparser
                const abstractSyntaxTree = parseJavaCode(data);
                codeFiles.set(currentDescriptor.name, new CodeFile(currentDescriptor.name, data, null, abstractSyntaxTree, 0, 0));
                processedCount++;
                if (processedCount === fileCount) {
                    callback(codeFiles);
                }
            }
        );
    }
}

/**
 *
 * @param {Array.<string>}filesToCheck
 * @returns {[Map<string, CodeFile>,Array.<Element>]}
 */
function getCheckedFileCode(filesToCheck) {
    let fileDictionary = new Map();
    let trCodeLines = [];
    let iLine = 0;
    $.each(
        filesToCheck,
        function (fileIndex, filename) {
            const trCodeLinesForFile = getTrCodesForCodeFile(filename);
            let fileCodeLines = [];
            const iStartLine = iLine;
            $.each(
                trCodeLinesForFile,
                function (trCodeLineIndex, trCodeLine) {
                    const codeText = $($(trCodeLine).find("div.gwt-Label")[0]).text();
                    fileCodeLines.push(codeText)
                    iLine++;
                }
            );
            const iEndLine = iLine;
            if(fileCodeLines.length > 0){
                // parser doesn't like comments after closing brace at the end of the last line of file for whatever reason
                fileCodeLines[fileCodeLines.length-1] = trimRightWhitespaceAndComments(fileCodeLines[fileCodeLines.length-1]);
            }
            const fileCode = fileCodeLines.join("\n");

            const [abstractSyntaxTree, parseError] = parseJavaCode(fileCode);
            fileDictionary.set(filename, new CodeFile(filename, fileCode, trCodeLinesForFile, abstractSyntaxTree, parseError, iStartLine, iEndLine));
            trCodeLines.push(...trCodeLinesForFile);
        }
    );
    return [fileDictionary, trCodeLines];
}

//TODO: use in indentation_module instead of countIndent after Matt is done working on it
/**
 * Gets width of indentation, in spaces or space-equivalents, for a given code line
 * @param {string} codeLine
 * @param {number} tabWidth assumed tab width
 * @return {number} indentation character count
 */
let indentationRegEx = /^(?:.*\*\/|\s*\/\*.*\*\/)?\s*/;
function getIndentationWidth(codeLine, tabWidth = 4) {
    let tabReplacement = " ".repeat(tabWidth);
    return codeLine.match(indentationRegEx)[0].replaceAll("\t", tabReplacement).length;
}

function removeIndentation(codeLine){
    return codeLine.replace(indentationRegEx, "");
}


function trimRightWhitespaceAndComments(codeText){
    return codeText.replace(/\s*(?:\s*\/\/.*|\s*\/\*.*\*\/)*(?:\/\*.*)?$/, "");
}

/**
 * Retrieve the code associated with the provided AST node.
 * @param {{location : {offset: *, line: *, column: *}}} astNode
 * @param {CodeFile} codeFile
 * @param {boolean} tryClearingIndentation when true, will remove the same whitespace as the first line of the code fragment from every remaining line
 */
function getNodeCode(astNode, codeFile, tryClearingIndentation = true) {
    let code = codeFile.sourceCode.substring(astNode.location.start.offset, astNode.location.end.offset);
    if (tryClearingIndentation) {
        let codeLines = code.split("\n");
        if (codeLines.length > 1) {
            const indentationLength = codeFile.codeLines[astNode.location.start.line - 1].match(/^(\s*).*/)[1].length;
            for (let iLine = 1; iLine < codeLines.length; iLine++) {
                codeLines[iLine] = codeLines[iLine].substring(indentationLength);
            }
            code = codeLines.join("\n");
        }
    }
    return code;
}

/**
 * Logs the code associated with the provided AST node to console.
 * @param {{location : {offset: *, line: *, column: *}}} astNode
 * @param {CodeFile} codeFile
 */
function logNodeCode(astNode, codeFile) {
    console.log(getNodeCode(astNode, codeFile));
}

/**
 * Return the same string with first letter capitalized.
 * @param {string} string
 * @return {string}
 */
function capitalize(string) {
    return string[0].toUpperCase() + string.slice(1);
}

/**
 * Compiles an array containing only the Declaration / MethodCall objects with unique "name" field from the input array
 * @param {Array.<Declaration>|Array.<MethodCall>} namesOrCallsArray
 * @return {Array.<Declaration>|Array.<MethodCall>}
 */
function uniqueNames(namesOrCallsArray) {
    let uniqueNamesMap = new Map();
    namesOrCallsArray.forEach(
        (resultObject) => {
            if (!uniqueNamesMap.has(resultObject.name)) {
                uniqueNamesMap.set(resultObject.name, resultObject);
            }
        }
    );
    return [...uniqueNamesMap.values()];
}

function getHelperMethodsUsedInCodeBlock(trCodeLines, helperMethods) {
    let usedMethods = [];
    for (const trCodeLine of trCodeLines) {
        const codeText = getCodeFromTrCodeLine(trCodeLine);
        _.each(helperMethods, function (m, mi) {
            if (codeText.match(m)) usedMethods.push(m);
        });
    }
    return usedMethods;
}

/**
 * Return a range of trCodeLines starting from line matching start regex (inclusive) and before
 * matching end regex (exclusive).
 * @param {Array.<HTMLTableRowElement>} trCodeLines
 * @param start start regex
 * @param end end regex
 * @return {Array.<HTMLTableRowElement>} resulting range.
 */
function getTrCodeLinesBetweenMarkers(trCodeLines, start, end) {

    let trCodeLinesInRange = [];
    let addToRange = false;

    for (const trCodeLine of trCodeLines) {
        const codeText = getCodeFromTrCodeLine(trCodeLine);
        if (addToRange && codeText.match(end)) {
            addToRange = false;
            return trCodeLinesInRange;
        }
        if (codeText.match(start)) {
            addToRange = true;
        }
        if (addToRange) {
            trCodeLinesInRange.push(trCodeLine);
        }
    }
    return trCodeLinesInRange;
}

/**
 * Find the first tr code line matching the given regex.
 * @param {Array.<HTMLTableRowElement>} trCodeLines an array of tr tags with code lines
 * @param {RegExp} regex the regex to use
 * @return {null|HTMLTableRowElement} the first tr code line matching regex, null if no matches are found.
 */
function findTrCodeLineUsingRegex(trCodeLines, regex) {
    for (const trCodeLine of trCodeLines) {
        const codeText = getCodeFromTrCodeLine(trCodeLine);
        if (codeText.match(regex)) {
            return trCodeLine;
        }
    }
    return null;
}


function addButton(innerText, clickListener, parent) {
    let button_search = document.createElement("button");
    button_search.innerText = innerText;
    button_search.onclick = clickListener;
    parent.appendChild(button_search);
}

function contains(elementList, regex) {
    let filteredElements = Array.prototype.slice.call(elementList).filter(function (e) {
        return regex.test(e.innerText);
    });
    return Array.prototype.slice.call(filteredElements);
}

function getInnerText(elementList, separator) {
    return elementList.map(function (e) {
        return e.innerText;
    }).join(separator);
}

function loadURL(url, domResponseHandler) {
    chrome.runtime.sendMessage({
        action: "xhttp",
        url: url
    }, function (responseText) {
        domResponseHandler(responseText);
    });
}

function reportScore(options) {
    chrome.runtime.sendMessage({
        action: "reportGrades",
        options: options
    }, function (response) {
        console.log(response)
    });
}

function stringDistance(s, t) {
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    return Math.min(
        stringDistance(s.substr(1), t) + 1,
        stringDistance(t.substr(1), s) + 1,
        stringDistance(s.substr(1), t.substr(1)) + (s[0] !== t[0] ? 1 : 0)
    );
}

/**
 * Replaces some html/xml reserved characters with their HTML entities, i.e. ">" with "&gt;"
 * @param {string} text
 */
function codeTextToHtmlText(text) {
    let iCharacter = text.length, parts = [];

    while (iCharacter--) {
        let characterCode = text[iCharacter].charCodeAt(0);
        if (characterCode < 65 || characterCode > 127 || (characterCode > 90 && characterCode < 97)) {
            parts[iCharacter] = '&#' + characterCode + ';';
        } else {
            parts[iCharacter] = text[iCharacter];
        }
    }
    return parts.join('');
}

/**
 * Returns the code line without the string literals, i.e. each double-quoted text occurrence is either removed or replaced
 * with the specified keyword
 * @param {string} text
 * @param {boolean} replaceWithKeyword
 * @param {string} keywordToReplaceWith
 * @return {string} text without string literals
 */
function stripStringsFromCode(text, replaceWithKeyword = false, keywordToReplaceWith = "STRING_LITERAL") {
    let parts = text.split(/(?<!\\)\"/);
    let newParts = [];
    for (let i_part = 0; i_part < parts.length; i_part++) {
        if (i_part % 2 === 0) {
            newParts.push(parts[i_part]);
        }
    }
    if (replaceWithKeyword) {
        return newParts.join(keywordToReplaceWith);
    } else {
        return newParts.join("");
    }

}

/**
 * Strips comments from code
 * @param {string} text
 */
function stripCommentsFromCode(text) {
    return text.replace(/\/\*[^*]*$|^[^*]*\*\/|\/\/.*$|\/\*[^*]*\*\//g, "");
}

function stripGenericArgumentsFromCode(text) {
    return text.replace(/<\s*\w*\s*>/g, "");
}