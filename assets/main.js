const METADATA_JSON = "assets/metadata.json?rel=1647948274";
const CONTENT_TYPE_XPI = "application/x-xpinstall";

import gat from "./config.js";
import snarkdown from "./snarkdown.es.js";

var gAPI = {
    request: async function (aUrl, aHeaders = {}) {
        let cachedKey = btoa(aUrl);
        let cachedETagKey = `${cachedKey}_ETag`;

        let etag = "";
        let data = localStorage.getItem(cachedKey);
        if (data) {
            data = JSON.parse(data);
            etag = localStorage.getItem(cachedETagKey);
        }

        let response = await fetch(aUrl, {
            method: "GET",
            headers: Object.assign({
                "If-None-Match": etag,
            }, aHeaders),
        });

        if (response.status == 304) {
            console.log(`Loading resource from cache: ${aUrl}`);
            // Take response data from local storage
        } else {
            data = await response.json();
            if (response.status == 200) {
                console.log(`Saving resource to cache: ${aUrl}`);
                localStorage.setItem(cachedKey, JSON.stringify(data));
                localStorage.setItem(cachedETagKey, response.headers.get("etag"));
            }
        }

        return data;        
    },

    requestFromGitHub: async function (aOptions, aEndpoint) {
        let apiUrl = "https://api.github.com/repos/";
        let url = `${apiUrl}${aOptions.owner}/${aOptions.repo}/${aEndpoint}`;
        let headers = {
            "Authorization": gat(),
        };
        return this.request(url, headers);
    },

    getLatestRelease: async function (aOptions) {
        return await this.requestFromGitHub(aOptions, "releases/latest");
    },

    getReleases: async function (aOptions) {
        return await this.requestFromGitHub(aOptions, "releases");
    },
};

var gSite = {
    _appendBadge: function (aTarget, aText, aClass = "") {
        let badgeElement = document.createElement("span");
        badgeElement.className = `badge ${aClass}`;
        badgeElement.innerText = aText;
        aTarget.appendChild(badgeElement);
        return badgeElement;
    },

    _appendButton: function (aTarget, aType) {
        let button = document.createElement("a");
        button.className = "button";
        switch (aType) {
            // 0: Install add-on
            case 0:
                let downloadIcon = document.createElement("img");
                downloadIcon.src = "assets/images/download.png";
                downloadIcon.className = "button-icon";
                button.append(downloadIcon);
                button.append("Install Now");
                button.href = "#";
                break;
            default:
                break;
        }
        aTarget.append(button);
        return button;
    },

    _setInstallTrigger: function (aTarget, aAddonName, aInstallData) {
        aTarget.addEventListener("click", function (aEvent) {
            aEvent.preventDefault();
            var parameters = {
                [aAddonName]: aInstallData
            };
            try {
                InstallTrigger.install(parameters);
            } catch (e) {
                // Rethrow and expose the DOMError
                console.error(e);
            }
        });
    },

    _createListItem: function () {
        let listItem = {
            parentElement: document.createElement("a"),
            body: document.createElement("div"),
            icon: document.createElement("img"),
            inner: document.createElement("div"),
            title: document.createElement("div"),
            desc: document.createElement("div"),
            appendDesc: function (aText) {
                let container = document.createElement("div");
                container.innerText = aText;
                this.desc.appendChild(container);
            },
        };

        listItem.parentElement.className = "list-item";
        listItem.body.className = "list-item-body";
        listItem.icon.className = "list-item-icon";
        listItem.title.className = "list-item-title";
        listItem.desc.className = "list-item-desc";

        listItem.parentElement.append(listItem.body);
        listItem.body.append(listItem.icon);
        listItem.body.append(listItem.inner);
        listItem.inner.append(listItem.title);
        listItem.inner.append(listItem.desc);

        return listItem;
    },

    generateList: function (aTarget, aAddons, aDefaultIcon) {
        for (let i = 0; i < aAddons.length; i++) {
            let addon = aAddons[i];
            let listItem = gSite._createListItem();

            // Icon
            if (addon.iconUrl) {
                listItem.icon.src = addon.iconUrl;
            } else {
                listItem.icon.src = aDefaultIcon;
            }
            listItem.icon.alt = `${addon.name} Icon`;

            // Title and description
            listItem.title.innerText = addon.name;
            listItem.desc.innerText = addon.description;

            // Download button
            if (addon.xpiUrl) {
                let button = gSite._appendButton(listItem.parentElement, 0);
                gSite._setInstallTrigger(button, addon.name, {
                    URL: addon.xpiUrl,
                    IconURL: addon.iconUrl,
                    Hash: addon.hash
                });
            }
            
            if (addon.externalUrl) {
                listItem.parentElement.href = addon.externalUrl;
                listItem.parentElement.target = "_blank";
                gSite._appendBadge(listItem.title, "External");
            }

            if (addon.apiUrl || addon.ghInfo) {
                listItem.parentElement.href = `/addons/get?addon=${addon.slug}`;
            }

            // Append list item to extensions list
            aTarget.appendChild(listItem.parentElement);
        }
    },

    generateAll: async function (aTarget, aMetadata) {
        if (!aTarget) {
            aTarget = document.getElementById("lists");
        }
        if (!aMetadata) {
            aMetadata = await gAPI.request(METADATA_JSON);
        }

        var types = aMetadata.types;
        for (let i = 0; i < types.length; i++) {
            let addonType = types[i];

            let list = document.createElement("div");
            list.className = "list";

            let listTitle = document.createElement("h1");
            listTitle.innerText = addonType.name;
            listTitle.id = addonType.slug;
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
        if (!urlParameters.has("addon")) {
            pageDetails.container.innerText = "Missing add-on parameter.";
            gSite.doneLoading();
            return;
        }

        var addon = await gSite.findAddon(urlParameters.get("addon"));
        if (!addon) {
            pageDetails.container.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        pageDetails.icon.src = addon.iconUrl;
        pageDetails.name.innerText = addon.name;
        pageDetails.description.innerText = addon.description;

        var resourceLinks = {
            xpi: document.getElementById("download-xpi"),
            tarball: document.getElementById("download-tarball"),
            zipball: document.getElementById("download-zipball"),
            versionHistory: document.getElementById("link-version-history"),
            supportSite: document.getElementById("link-support-site"),
            supportEmail: document.getElementById("link-support-email"),
            sourceRepository: document.getElementById("link-source-repo"),
        };

        if (addon.supportUrl) {
            resourceLinks.supportSite.href = addon.supportUrl;
        }
        if (addon.supportEmail) {
            resourceLinks.supportEmail.href = addon.supportEmail;
        }
        if (addon.repositoryUrl) {
            resourceLinks.sourceRepository.href = addon.repositoryUrl;
        }

        var releaseData = await gAPI.getLatestRelease(addon.ghInfo);

        if (!releaseData) {
            pageDetails.container.innerText = "Failed to retrieve add-on information from GitHub.";
            gSite.doneLoading();
            return;
        }

        pageDetails.author.innerText = `By ${releaseData.author.login}`;
        pageDetails.version.innerText = releaseData.tag_name;
        pageDetails.about.innerHTML = snarkdown(releaseData.body);

        resourceLinks.tarball.href = releaseData.tarball_url;
        resourceLinks.zipball.href = releaseData.zipball_url;
        resourceLinks.versionHistory.href = `/addons/versions?addon=${addon.slug}`;

        for (let i = 0; i < releaseData.assets.length; i++) {
            let asset = releaseData.assets[i];
            if (asset.content_type != CONTENT_TYPE_XPI) {
                continue;
            }

            gSite._setInstallTrigger(pageDetails.download, addon.name, {
                URL: asset.browser_download_url,
                IconURL: addon.iconUrl,
            });

            pageDetails.download.href = "#";
            resourceLinks.xpi.href = asset.browser_download_url;

            let date = new Date(asset.updated_at);
            let dateOptions = { year: "numeric", month: "long", day: "numeric" };
            let dateString = date.toLocaleDateString(undefined, dateOptions);

            pageDetails.updateDate.innerText = dateString;
            pageDetails.size.innerText = `${Math.round(asset.size / 1024)} KB`;

            break;
        }

        var resourceElements = Object.values(resourceLinks);
        for (let i = 0; i < resourceElements.length; i++) {
            let target = resourceElements[i];
            if (target.href == "") {
                target.hidden = true;
            }
        }
    },

    generateVersions: async function () {
        var pageDetails = {
            icon: document.getElementById("addon-icon"),
            name: document.getElementById("addon-name"),
            releaseCount: document.getElementById("addon-release-count"),
            releaseList: document.getElementById("list-releases"),
            container: document.getElementById("addon-container"),
        };

        var urlParameters = new URLSearchParams(window.location.search);
        if (!urlParameters.has("addon")) {
            pageDetails.container.innerText = "Missing add-on parameter.";
            gSite.doneLoading();
            return;
        }

        var addon = await gSite.findAddon(urlParameters.get("addon"));
        if (!addon) {
            pageDetails.container.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        pageDetails.icon.src = addon.iconUrl;
        pageDetails.name.innerText = addon.name;

        var resourceLinks = {
            addonDetails: document.getElementById("link-addon-details"),
            supportSite: document.getElementById("link-support-site"),
            supportEmail: document.getElementById("link-support-email"),
            sourceRepository: document.getElementById("link-source-repo"),
        };

        resourceLinks.addonDetails.href = `/addons/get?addon=${addon.slug}`;
        if (addon.supportUrl) {
            resourceLinks.supportSite.href = addon.supportUrl;
        }
        if (addon.supportEmail) {
            resourceLinks.supportEmail.href = addon.supportEmail;
        }
        if (addon.repositoryUrl) {
            resourceLinks.sourceRepository.href = addon.repositoryUrl;
        }
        var resourceElements = Object.values(resourceLinks);
        for (let i = 0; i < resourceElements.length; i++) {
            let target = resourceElements[i];
            if (target.href == "") {
                target.hidden = true;
            }
        }

        var releaseData = await gAPI.getReleases(addon.ghInfo);

        if (releaseData.message) {
            pageDetails.container.innerText = releaseData.message;
            gSite.doneLoading();
            return;
        }

        pageDetails.releaseCount.innerText = releaseData.length;

        for (let i = 0; i < releaseData.length; i++) {
            let currentRelease = releaseData[i];
            let listItem = gSite._createListItem();
            listItem.icon.remove();

            // Title and description
            listItem.title.innerText = currentRelease.tag_name;

            // Append list item to releases list
            pageDetails.releaseList.appendChild(listItem.parentElement);
            
            if (currentRelease.prerelease) {
                gSite._appendBadge(listItem.title, "Pre-release", "prerelease");
            }
            
            for (let j = 0; j < currentRelease.assets.length; j++) {
                let asset = currentRelease.assets[j];
                if (asset.content_type != CONTENT_TYPE_XPI) {
                    continue;
                }

                // Download button
                let button = gSite._appendButton(listItem.parentElement, 0);
                gSite._setInstallTrigger(button, addon.name, {
                    URL: asset.browser_download_url,
                    IconURL: addon.iconUrl,
                });

                let date = new Date(asset.updated_at);
                let dateOptions = { year: "numeric", month: "long", day: "numeric" };
                let dateString = date.toLocaleDateString(undefined, dateOptions);

                listItem.appendDesc(`Released: ${dateString}`);
                listItem.appendDesc(`Size: ${Math.round(asset.size / 1024)} KB`);

                break;
            }
        }
    },

    findAddon: async function (aSlug) {
        var metadata = await gAPI.request(METADATA_JSON);
        var addon = metadata.addons.find(function (item) {
            return item.slug == aSlug;
        });
        return addon;
    },

    doneLoading: function () {
        document.body.setAttribute("data-loaded", true);
        // Handle the fragment identifier, necessary if the anchor
        // is dynamically generated
        let fragmentId = window.location.hash.substr(1);
        if (fragmentId) {
            let targetElement = document.getElementById(fragmentId);
            if (targetElement) {
                targetElement.scrollIntoView(true);
            }
        }
    },
};

export default gSite;
