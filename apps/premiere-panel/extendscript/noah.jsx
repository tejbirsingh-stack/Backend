// Noah Media Manager - ExtendScript for Adobe Premiere Pro
// This script handles the communication between the panel and Premiere Pro

// Global functions accessible from the panel
var Noah = {
    
    // Import a media file into the current project
    importAsset: function(filePath, fileName) {
        try {
            var project = app.project;
            if (!project) {
                return "ERROR: No active project found";
            }
            
            // Get the root bin or create a Noah folder
            var targetBin = this.getOrCreateNoahBin();
            
            // Import the file
            var success = project.importFiles(
                [filePath],
                true,  // suppress UI
                targetBin,
                false  // import as numbered stills
            );
            
            if (success) {
                return "SUCCESS: Imported " + fileName + " to Noah folder";
            } else {
                return "ERROR: Failed to import " + fileName;
            }
            
        } catch (error) {
            return "ERROR: " + error.toString();
        }
    },
    
    // Get or create a "Noah Assets" bin in the project
    getOrCreateNoahBin: function() {
        var project = app.project;
        var rootItem = project.rootItem;
        
        // Look for existing Noah folder
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === "Noah Assets" && child.type === ProjectItemType.BIN) {
                return child;
            }
        }
        
        // Create new Noah folder
        var noahBin = rootItem.createBin("Noah Assets");
        return noahBin;
    },
    
    // Add asset to timeline at playhead position
    addToTimeline: function(filePath, trackIndex) {
        try {
            var project = app.project;
            var sequence = project.activeSequence;
            
            if (!sequence) {
                return "ERROR: No active sequence found";
            }
            
            // First import the asset
            var importResult = this.importAsset(filePath, "temp");
            if (importResult.indexOf("ERROR") === 0) {
                return importResult;
            }
            
            // Find the imported item
            var projectItem = this.findProjectItemByPath(filePath);
            if (!projectItem) {
                return "ERROR: Could not find imported asset";
            }
            
            // Add to timeline
            var videoTrack = sequence.videoTracks[trackIndex || 0];
            var audioTrack = sequence.audioTracks[trackIndex || 0];
            
            if (projectItem.hasVideo && videoTrack) {
                videoTrack.insertClip(projectItem, sequence.getPlayerPosition());
            }
            
            if (projectItem.hasAudio && audioTrack) {
                audioTrack.insertClip(projectItem, sequence.getPlayerPosition());
            }
            
            return "SUCCESS: Added to timeline";
            
        } catch (error) {
            return "ERROR: " + error.toString();
        }
    },
    
    // Find a project item by file path
    findProjectItemByPath: function(filePath) {
        var project = app.project;
        
        function searchBin(bin) {
            for (var i = 0; i < bin.children.numItems; i++) {
                var child = bin.children[i];
                if (child.type === ProjectItemType.CLIP && child.getMediaPath() === filePath) {
                    return child;
                } else if (child.type === ProjectItemType.BIN) {
                    var found = searchBin(child);
                    if (found) return found;
                }
            }
            return null;
        }
        
        return searchBin(project.rootItem);
    },
    
    // Get current project information
    getProjectInfo: function() {
        try {
            var project = app.project;
            if (!project) {
                return JSON.stringify({ error: "No active project" });
            }
            
            var sequence = project.activeSequence;
            var info = {
                projectName: project.name,
                projectPath: project.path,
                hasActiveSequence: !!sequence,
                sequenceName: sequence ? sequence.name : null,
                videoTracks: sequence ? sequence.videoTracks.numTracks : 0,
                audioTracks: sequence ? sequence.audioTracks.numTracks : 0,
                playheadTime: sequence ? sequence.getPlayerPosition().seconds : 0
            };
            
            return JSON.stringify(info);
            
        } catch (error) {
            return JSON.stringify({ error: error.toString() });
        }
    },
    
    // Create a new sequence with Noah preset
    createNoahSequence: function(name, preset) {
        try {
            var project = app.project;
            if (!project) {
                return "ERROR: No active project found";
            }
            
            // Use a standard preset or custom settings
            var sequenceName = name || "Noah Sequence " + (new Date()).getTime();
            
            // Create sequence with default settings
            var newSequence = project.createNewSequence(sequenceName, "");
            
            if (newSequence) {
                project.activeSequence = newSequence;
                return "SUCCESS: Created sequence " + sequenceName;
            } else {
                return "ERROR: Failed to create sequence";
            }
            
        } catch (error) {
            return "ERROR: " + error.toString();
        }
    },
    
    // Export current sequence using Noah settings
    exportSequence: function(exportPath, presetPath) {
        try {
            var project = app.project;
            var sequence = project.activeSequence;
            
            if (!sequence) {
                return "ERROR: No active sequence to export";
            }
            
            // Use Adobe Media Encoder if available
            if (app.encoder) {
                var success = app.encoder.encodeSequence(
                    sequence,
                    exportPath,
                    presetPath,
                    app.encoder.ENCODE_IN_TO_OUT,
                    1  // Remove from queue when complete
                );
                
                if (success) {
                    return "SUCCESS: Export started for " + sequence.name;
                } else {
                    return "ERROR: Failed to start export";
                }
            } else {
                return "ERROR: Adobe Media Encoder not available";
            }
            
        } catch (error) {
            return "ERROR: " + error.toString();
        }
    }
};

// Make functions available to the panel
if (typeof exports !== 'undefined') {
    exports.Noah = Noah;
}
