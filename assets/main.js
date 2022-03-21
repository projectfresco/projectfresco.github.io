const METADATA_JSON = "assets/metadata.json";
const CONTENT_TYPE_XPI = "application/x-xpinstall";

var gSite = {
    generateList: function (aTarget, aAddons, aDefaultIcon) {
        for (let i = 0; i < aAddons.length; i++) {
            let addon = aAddons[i];

            let listItem = document.createElement("a");
            listItem.className = "list-item";

            let listItemBody = document.createElement("div");
            listItemBody.className = "list-item-body";
            listItem.append(listItemBody);

            // Icon
            let listItemIcon = document.createElement("img");
            listItemIcon.className = "list-item-icon";
            if (addon.iconUrl) {
                listItemIcon.src = addon.iconUrl;
            } else {
                listItemIcon.src = aDefaultIcon;
            }
            listItemIcon.alt = `${addon.name} Icon`;
            listItemBody.append(listItemIcon);

            // Title and description
            let listItemInner = document.createElement("div");
            listItemBody.append(listItemInner);
            
            let listItemTitle = document.createElement("span");
            listItemTitle.className = "list-item-title";
            listItemTitle.innerText = addon.name;
            listItemInner.append(listItemTitle);

            let listItemDesc = document.createElement("span");
            listItemDesc.className = "list-item-desc";
            listItemDesc.innerText = addon.description;
            listItemInner.append(listItemDesc);

            // Download button
            if (addon.xpiUrl) {
                let button = document.createElement("a");
                button.className = "button";
                button.addEventListener("click", function (aEvent) {
                    aEvent.preventDefault();
                    var parameters = {
                        [addon.name]: {
                            URL: addon.xpiUrl,
                            IconURL: addon.iconUrl,
                            Hash: addon.hash,
                        }
                    };
                    try {
                        InstallTrigger.install(parameters);
                    } catch (e) {
                        // Rethrow and expose the DOMError
                        console.error(e);
                    }
                });
                button.href = "#";
                listItem.append(button);

                let downloadIcon = document.createElement("img");
                downloadIcon.src = "assets/images/download.png";
                downloadIcon.className = "button-icon";
                button.append(downloadIcon);
                button.append("Install Now");
            }
            
            if (addon.externalUrl) {
                listItem.href = addon.externalUrl;
            }

            if (addon.apiUrl) {
                listItem.href = `/addons/addon?id=${addon.id}`;
            }

            // Append list item to extensions list
            aTarget.appendChild(listItem);
        }
    },

    generateAll: async function (aTarget, aMetadata) {
        if (!aTarget) {
            aTarget = document.getElementById("lists");
        }
        if (!aMetadata) {
            aMetadata = await gSite.getMetadata();
        }

        var types = aMetadata.types;
        for (let i = 0; i < types.length; i++) {
            let addonType = types[i];

            let list = document.createElement("div");
            list.id = `list-${addonType.id}`;
            list.className = "list";

            let listTitle = document.createElement("h1");
            listTitle.innerText = addonType.name;
            listTitle.id = addonType.id;
            list.append(listTitle);

            let addons = aMetadata.addons.filter(function (item) {
                return item.type == addonType.type;
            });
            gSite.generateList(list, addons, addonType.defaultIcon);

            aTarget.append(list);
        }
    },

    generateAddon: async function () {
        var pageDetails = {
            icon: document.getElementById("addon-icon"),
            name: document.getElementById("addon-name"),
            author: document.getElementById("addon-author"),
            description: document.getElementById("addon-desc"),
            download: document.getElementById("addon-download"),
            version: document.getElementById("addon-version"),
            updateDate: document.getElementById("addon-update-date"),
            size: document.getElementById("addon-size"),
            about: document.getElementById("addon-about"),
            container: document.getElementById("addon-container"),
        };

        var urlParameters = new URLSearchParams(window.location.search);
        if (!urlParameters.has("id")) {
            pageDetails.container.innerText = "Missing add-on ID parameter.";
            gSite.doneLoading();
            return;
        }

        var addon = await gSite.findAddon(urlParameters.get("id"));
        if (!addon) {
            pageDetails.container.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        pageDetails.icon.src = addon.iconUrl;
        pageDetails.name.innerText = addon.name;
        pageDetails.description.innerText = addon.description;

        var releaseResponse = await fetch(`${addon.apiUrl}/releases/latest`);
        var releaseData = await releaseResponse.json();

        pageDetails.author.innerText = `By ${releaseData.author.login}`;
        pageDetails.version.innerText = releaseData.tag_name;
        pageDetails.about.innerText = releaseData.body;

        for (let i = 0; i < releaseData.assets.length; i++) {
            let asset = releaseData.assets[i];
            if (asset.content_type != CONTENT_TYPE_XPI) {
                continue;
            }
            pageDetails.download.addEventListener("click", function (aEvent) {
                aEvent.preventDefault();
                var parameters = {
                    [addon.name]: {
                        URL: asset.browser_download_url,
                        IconURL: addon.iconUrl,
                    }
                };
                try {
                    InstallTrigger.install(parameters);
                } catch (e) {
                    // Rethrow and expose the DOMError
                    console.error(e);
                }
            });
            pageDetails.download.href = "#";

            let date = new Date(asset.updated_at);
            let dateOptions = { year: "numeric", month: "long", day: "numeric" };
            let dateString = date.toLocaleDateString(undefined, dateOptions);

            pageDetails.updateDate.innerText = dateString;
            pageDetails.size.innerText = `${Math.round(asset.size / 1024)} KB`;

            break;
        }        
    },

    getMetadata: async function () {
        var response = await fetch(METADATA_JSON);
        var responseJson = await response.json();
        return responseJson;
    },

    findAddon: async function (aId) {
        var metadata = await gSite.getMetadata();
        var addon = metadata.addons.find(function (item) {
            return item.id == aId;
        });
        return addon;
    },

    getReleaseInfo: async function (aUrl) {
    },

    doneLoading: function () {
        document.body.setAttribute("data-loaded", true);
    },
};
