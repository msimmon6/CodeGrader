/*
* Copyright 2020 Gregory Kramida, William Siew, Matthew Simmons
* */


/**
 * Checks the URL or other property of the current web page and runs the allowed functions
 * @param {Options} options
 */
function main(options) {

    // condition: URL contains 'instructor' keyword
    // add 'review' buttons next to last submission date for directly going to review page
    if (location.href.indexOf('instructor') > -1) {
        let tableSubmissions = $("table:contains('last submission')");
        let acctColumn = $(tableSubmissions).find("tr").find("td:nth-child(3)");
        let onTimeColumn = $(tableSubmissions).find("tr").find("td:nth-child(8)");
        let lateColumn = $(tableSubmissions).find("tr").find("td:nth-child(9)");
        // let projectIndex = location.href.search(/projectPK=(\d+)/);
        for (let iStudent = 0; iStudent < onTimeColumn.length; iStudent++) {
            let onTimeTableCell = onTimeColumn[iStudent];
            let lateTableCell = lateColumn[iStudent];
            let acctTableCell = acctColumn[iStudent];
            if (isMemberOfStudentSet(acctTableCell, options.firstStudent, options.lastStudent)
                && (hasSubmissionInOverviewTableCell(onTimeTableCell) || hasSubmissionInOverviewTableCell(lateTableCell))) {
                let onTimeAutomaticTestScore = getAutomaticTestsScoreFromOverviewTableCell(onTimeTableCell);
                let lateAutomaticTestScoreWithAdjustment =
                    getAutomaticTestsScoreFromOverviewTableCell(lateTableCell) + options.lateScoreAdjustment;
                if (onTimeAutomaticTestScore > lateAutomaticTestScoreWithAdjustment) {
                    addReviewLinkToOverviewTableCell(onTimeTableCell)
                } else {
                    addReviewLinkToOverviewTableCell(lateTableCell)
                }
            }
        }

    }

    const semesterString = options.semesterSeason + options.year.toString();

    // condition: URL contains 'codeReview' and the semester matches the semester selected in options.
    if (location.href.indexOf('codeReview') > -1 && location.href.indexOf(semesterString) > -1) {
        const assignmentName = options.submitServerAssignmentName.replace("(", "\\(").replace(")", "\\)");
        let filePaths = expandFilePathEntryList(options.filesToCheck);

        const headerText = document.querySelector("h1").textContent;
        // check if it's the right course & project
        if (headerText.match(assignmentName)) {
            //FIXME
            // highlightAllCheckedCode(options.filesToCheck);
            // hljs.initHighlightingOnLoad();

            const studentName = (/[^,]*,\s*written\s*by\s*([^(]*).*/.exec(headerText)[1]).trim();

            //start logging usage statistics for this session
            chrome.runtime.sendMessage({
                action: "timeTab",
                sessionUrl: location.href,
                studentName: studentName
            });

            recolorCheckedFileLinks(filePaths);
            scrollToFirstFile(filePaths);
            constructUiPanel(options, filePaths);
        }

        // assign click event to predefined comment buttons
        $(".tip").click(function () {
            eventFire($(this).parent()[0], 'dblclick');
            let self = this;
            setTimeout(function () {
                $(self).parent().parent().find("input[type='checkbox']").prop("checked", false);
                let textBox = $(self).parent().parent().find("textarea");
                textBox.attr("aria-hidden", "false");
                if ($(self).attr('msg') !== "") {
                    $(textBox).val($(self).attr('msg'));
                    eventFire($(textBox).parent().find("a:contains('Save')")[0], 'click');
                } else {
                    $(textBox).val("");
                }
            }, 500);
        });

        $(".code").click(function () {
            eventFire($(this).parent()[0], 'dblclick');

            setTimeout(function () {
                const checkboxes = $(this).parent().find("input[type='checkbox']");
                checkboxes.prop("checked", false);
                checkboxes.prop("disabled", true);
            }, 500)
        });
    }

} // MAIN ENDS

function constructUiPanel(options, filePaths) {
    // first, create summary uiPanel
    let uiPanelContainer = document.createElement('div');
    uiPanelContainer.setAttribute('class', 'ui-panel-container');
    let uiPanel = document.createElement('div');
    uiPanel.setAttribute('class', 'ui-panel');
    uiPanelContainer.appendChild(uiPanel);
    document.body.appendChild(uiPanelContainer);

    makeCodeFeedArrow();

    if (filePaths.length === 0) {
        $(uiPanel).append(makeWarning("Note: no files found matching to the entries provided in \"filesToCheck\" in " +
            "plugin options, continuing with review modules disabled."));
    } else {
        const [codeFileDictionary, trCodeLines] = getCheckedFileCode(filePaths);
        for (const codeFile of codeFileDictionary.values()) {
            code_analysis.findComponentsInCodeFileAst(codeFile);
        }
        for (const [fileName, codeFile] of codeFileDictionary.entries()) {
            if (codeFile.parseError !== null) {
                $(uiPanel).append(makeWarning("Note: parse error in file '" + fileName +
                    "'. Please check developer console for details. Disabling modules that depend on static code analysis for this file."));
                console.log(codeFile.parseError);
            }
        }

        // TODO: every module should contain these three methods, as well as the getCodeEntities() method to test them.
        //  This way, we can just stick them into an array and call these three functions while traversing it.
        keyword_and_pattern_module.initialize(options);
        keyword_and_pattern_module.processCode(codeFileDictionary);
        keyword_and_pattern_module.addInfoToUiPanel(uiPanel);

        naming_module.initialize(options);
        naming_module.processCode(codeFileDictionary);
        naming_module.addInfoToUiPanel(uiPanel);

        method_call_module.initialize(options);
        method_call_module.processCode(codeFileDictionary);
        method_call_module.addInfoToUiPanel(uiPanel);

        spacing_module.initialize(options)
        spacing_module.processCode(codeFileDictionary)
        spacing_module.addInfoToUiPanel(uiPanel)

        brace_style_module.initialize(options);
        brace_style_module.processCode(codeFileDictionary);
        brace_style_module.addInfoToUiPanel(uiPanel);

        unused_code_module.initialize(options)
        unused_code_module.processCode(codeFileDictionary)
        unused_code_module.addInfoToUiPanel(uiPanel);

        //TODO: CodeEntity overhaul
        test_module.initialize(uiPanel, codeFileDictionary, options.moduleOptions.test_module);

        indentation_module.initialize(options);
        indentation_module.processCode(codeFileDictionary);
        indentation_module.addInfoToUiPanel(uiPanel);

        //TODO: CodeEntity overhaul
        line_length_module.initialize(uiPanel, codeFileDictionary, options.moduleOptions.line_length_module);
        loop_module.initialize(uiPanel, codeFileDictionary, options.moduleOptions.loop_module);
    }

    grade_server_module.initializeAndAddToUI(uiPanel, options.moduleOptions.grade_server_module, options.semesterSeason, options.year, options.lateScoreAdjustment);
}

$(document).ready(function () {
    setTimeout(
        function () {
            restoreOptions(main);
        },
        3000
    );
});