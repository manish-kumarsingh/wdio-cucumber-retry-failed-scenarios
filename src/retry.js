'use strict';

const fs = require('fs'),
    walkSync = require('walk-sync');

let failurePercentage, executionResultsFolder, consolidatedResultFile, tempConsolidatedResultFile,
    finalConsolidatedResultFile, failedScenarioFeatureFileNameAndPath;

module.exports = {

    identifyFailedScenarios: (input) => {
        if (!input.executionResultsFolder.endsWith('/'))
            executionResultsFolder = input.executionResultsFolder + '/';
        else
            executionResultsFolder = input.executionResultsFolder;
        
        consolidatedResultFile = executionResultsFolder + '_executionResults_merged.json';
        tempConsolidatedResultFile = executionResultsFolder + '_executionResults_temp.json';
        finalConsolidatedResultFile = executionResultsFolder + '_executionResults.json';
        failedScenarioFeatureFileNameAndPath = '_failedScenarios.feature';

        let tag = input.tag == undefined ? '' : input.tag;

        // Find the list of execution reports
        let resultFiles = walkSync(executionResultsFolder, { directories: false });
        let consolidatedResult = [];
        fs.writeFileSync(consolidatedResultFile, '[', 'utf-8');

        // Navigate through the result files
        for (let i = 0; i < resultFiles.length; i++) {
            if (resultFiles[i].split('.').pop() == 'json') {
                // Read the individual result files
                let parsedData = JSON.parse(fs.readFileSync(executionResultsFolder + resultFiles[i]));

                // If the result file has data then push the results into an array
                if (parsedData.length != 0) {
                    for (let j = 0; j < parsedData.length; j++)
                        consolidatedResult.push(JSON.stringify(parsedData[j], null, 2));
                }

                // Delete the individual result file
                fs.unlink(executionResultsFolder + resultFiles[i]);
            }
        }

        // Write the consolidated results into a single file
        fs.appendFileSync(consolidatedResultFile, consolidatedResult, 'utf-8');
        fs.appendFileSync(consolidatedResultFile, ']', 'utf-8');

        // Read the consolidated execution results
        let executionResults = JSON.parse(fs.readFileSync(consolidatedResultFile, 'utf-8'));
        let totalScenarios = 0, failedScenarios = 0;

        // Create a temporary feature file
        fs.writeFileSync(failedScenarioFeatureFileNameAndPath, tag + '\nFeature: Re-execute the list of failed scenarios \n\n', 'utf-8');

        // Parse through the execution results to find out the failed scenarios
        for (let l = 0; l < executionResults.length; l++) {
            // Parse through the Features
            if (executionResults[l].hasOwnProperty('elements')) {
                let scenarios = executionResults[l].elements;
                totalScenarios = totalScenarios + scenarios.length;
                // Parse through the scenarios of the feature
                for (let i = 0; i < scenarios.length; i++) {
                    let scenarioDetail = '';
                    // Read all the tags to write to the temporary feature file
                    if (scenarios[i].hasOwnProperty('tags')) {
                        for (let k = 0; k < scenarios[i].tags.length; k++)
                            scenarioDetail = scenarioDetail + scenarios[i].tags[k].name + ' ';
                    }
                    // Read the scenario description
                    scenarioDetail = scenarioDetail + '\n' + scenarios[i].keyword + ': ' + scenarios[i].name + '\n';
                    let status = true;

                    // Parse through the steps of the scenario
                    for (let j = 0; j < scenarios[i].steps.length; j++) {
                        // Read the status of all the steps
                        let stepStatus = scenarios[i].steps[j].result.status == 'passed';

                        // Determine the overall status of the scenario
                        status = status && stepStatus;

                        // Read the steps of the scenario
                        scenarioDetail = scenarioDetail + scenarios[i].steps[j].keyword + scenarios[i].steps[j].name + '\n';
                    }
                    if (status == false) {
                        failedScenarios++;
                        // Give every failure a number in a temp field 'failureNumber' which would be referenced later
                        executionResults[l].elements[i].description = (failedScenarios - 1).toString();

                        // Write the failed scenario in a temporary feature file
                        fs.appendFileSync(failedScenarioFeatureFileNameAndPath, scenarioDetail + '\n', 'utf-8');
                    }
                }
            }
        }

        // Create a temporary execution results file and store the results with updated description
        fs.writeFileSync(tempConsolidatedResultFile, JSON.stringify(executionResults, null, 2), 'utf-8');

        // Re-Execute the failed scenarios if overall failure percentage is less than 20%
        failurePercentage = Math.ceil(failedScenarios / totalScenarios * 100);
        console.log('Percentage of scenarios failed: ' + failurePercentage + '%');

        if (failurePercentage > parseInt(input.failureThreshold)) {
            // Print the list of failed scenarios
            console.log('PRINTING FAILED SCENARIOS');
            console.log(fs.readFileSync(failedScenarioFeatureFileNameAndPath, 'utf-8'));

            console.log('More than 20% of the scenarios failed. Not re-executing the failed scenarios.');
            fs.unlink(failedScenarioFeatureFileNameAndPath);
            fs.unlink(tempConsolidatedResultFile);
            return false;
        }
        else if (failurePercentage == 0) {
            console.log('No failed scenarios to re-run.');
            fs.unlink(tempConsolidatedResultFile);
            fs.unlink(failedScenarioFeatureFileNameAndPath);
            return false;
        }
        else {
            // Print the list of failed scenarios
            console.log('PRINTING FAILED SCENARIOS\n');
            console.log(fs.readFileSync(failedScenarioFeatureFileNameAndPath, 'utf-8'));

            input.configDetails.specs = [failedScenarioFeatureFileNameAndPath];
            fs.writeFileSync('_failedScenariosConf.js', 'exports.config = ' + JSON.stringify(input.configDetails), 'utf-8');
            return true;
        }
    },

    updateResultFiles: (input) => {
        if (!input.executionResultsFolder.endsWith('/'))
            executionResultsFolder = input.executionResultsFolder + '/';
        else
            executionResultsFolder = input.executionResultsFolder;
        
        consolidatedResultFile = executionResultsFolder + '_executionResults_merged.json';
        tempConsolidatedResultFile = executionResultsFolder + '_executionResults_temp.json';
        finalConsolidatedResultFile = executionResultsFolder + '_executionResults.json';
        failedScenarioFeatureFileNameAndPath = '_failedScenarios.feature';

        // Read the temp execution results which had updated descriptions
        let executionResults = JSON.parse(fs.readFileSync(tempConsolidatedResultFile, 'utf-8'));
        let newResultFiles = walkSync(executionResultsFolder, { directories: false });

        // Read the failure re-execution execution results
        let reExecutionResults = fs.readFileSync(executionResultsFolder + newResultFiles[newResultFiles.length - 1], 'utf-8');

        // Merge the reExecution results into the original execution results
        for (let l = 0; l < executionResults.length; l++) {
            // Parse through the Features
            if (executionResults[l].hasOwnProperty('elements')) {
                // Parse through the scenarios of the feature
                let scenarios = executionResults[l].elements;
                for (let i = 0; i < scenarios.length; i++) {
                    let status = true;
                    // Parse through the steps of the scenario
                    for (let j = 0; j < scenarios[i].steps.length; j++) {
                        // Read the status of all the steps
                        let stepStatus = scenarios[i].steps[j].result.status == 'passed';

                        // Determine the overall status of the scenario
                        status = status && stepStatus;
                    }
                    if (status == false) {
                        // In case this is a failed scenario, replace the steps of the original execution with the steps of the re-executed results
                        scenarios[i].steps = JSON.parse(reExecutionResults)[0].elements[parseInt(scenarios[i].description)].steps;

                        // Delete the key which was set for failed scenarios
                        scenarios[i].description = "";
                    }
                }
            }
        }

        // Write the final results into a file which will be used by Jenkins to generate the Cucumber report
        fs.writeFileSync(finalConsolidatedResultFile, JSON.stringify(executionResults, null, 2), 'utf-8');

        // delete all the json output files except the final merged file
        let finalResultFiles = walkSync(executionResultsFolder, { directories: false });
        for (let i = 0; i < finalResultFiles.length; i++) {
            if (executionResultsFolder + finalResultFiles[i] != finalConsolidatedResultFile &&
                executionResultsFolder + finalResultFiles[i] != executionResultsFolder + '.gitkeep')
                fs.unlink(executionResultsFolder + finalResultFiles[i]);
        }
        if (fs.existsSync('_failedScenarios.feature'))
            fs.unlink('_failedScenarios.feature');
        if (fs.existsSync('_failedScenariosConf.js'))
            fs.unlink('_failedScenariosConf.js');
    }
};