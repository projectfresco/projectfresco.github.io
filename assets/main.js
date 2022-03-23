const APP_NAME = "Fresco";
const APP_VERSION = "0.0.1";
const METADATA_JSON = "assets/metadata.json";
const CONTENT_TYPE_XPI = "application/x-xpinstall";
const URL_GITHUB_API = "https://api.github.com/repos";
const URL_GITHUB = "https://github.com";

import gat from "./config.js";

var gAPI = {
    request: async function (aUrl, aHeaders = new Headers()) {
        let cacheKey = btoa(aUrl);
        let cacheETagKey = `${cacheKey}_ETag`;

        let data = localStorage.getItem(cacheKey);
        let etag = localStorage.getItem(cacheETagKey);
        if (data && etag) {
            data = JSON.parse(data);
            aHeaders.append("If-None-Match", etag);
        }
        aHeaders.append("User-Agent", `${APP_NAME}/${APP_VERSION}`);

        let response = await fetch(aUrl, {
            method: "GET",
            headers: aHeaders,
        });

        let isCached = false;
        if (response.status == 304) {
            console.log(`Loading resource from cache: ${aUrl}`);
            // Take response data from local storage
            isCached = true;
        } else {
            data = await response.json();
            if (response.status == 200) {
                console.log(`Saving resource to cache: ${aUrl}`);
                localStorage.setItem(cacheKey, JSON.stringify(data));
                localStorage.setItem(cacheETagKey, response.headers.get("etag"));
            }
        }

        return {
            json: data,
            isCached: isCached,
            cacheKey: cacheKey,
        };
    },

    requestFromGitHub: async function (aOptions, aEndpoint) {
        let url = `${URL_GITHUB_API}/${aOptions.owner}/${aOptions.repo}/${aEndpoint}`;
        let headers = new Headers({
            "Authorization": gat(),
        });
        return this.request(url, headers);
    },

    getReleases: async function (aOptions) {
        let response = await this.requestFromGitHub(aOptions, "releases");
        if (!response.isCached) {
            // Convert GitHub releases to custom releases format
            var releases = {
                totalDownloadCount: 0,
                data: [],
            };
            for (let ghRelease of response.json) {
                var release = {
                    name: ghRelease.name || ghRelease.tag_name,
                    changelog: ghRelease.body,
                    prerelease: ghRelease.prerelease,
                    datePublished: ghRelease.published_at,
                    dateCreated: ghRelease.created_at,
                    zipballUrl: ghRelease.zipball_url,
                    tarballUrl: ghRelease.tarball_url,
                    xpiUrl: "",
                    xpiHash: "",
                    xpiSize: 0,
                    xpiDownloadCount: 0,
                    author: {
                        slug: "",
                        name: ghRelease.author.login,
                        avatarUrl: ghRelease.author.avatar_url,
                    },
                };
                for (let asset of ghRelease.assets) {
                    if (asset.content_type != CONTENT_TYPE_XPI) {
                        continue;
                    }
                    release.xpiUrl = asset.browser_download_url;
                    release.xpiSize = asset.size;
                    release.xpiDownloadCount = asset.download_count;
                    releases.totalDownloadCount += asset.download_count;
                    break;
                }
                releases.data.push(release);
            }
            // Replace cached JSON with converted releases copy
            localStorage.setItem(response.cacheKey, JSON.stringify(releases));
            return releases;
        }
        return response.json;
    },

    getRepositoryUrl: function (aOptions) {
        return `${URL_GITHUB}/${aOptions.owner}/${aOptions.repo}`;
    },
};

var gSite = {
    _formatDate: function (aDateString) {
        let date = new Date(aDateString);
        let dateOptions = { year: "numeric", month: "long", day: "numeric" };
        let formattedDate = date.toLocaleDateString(undefined, dateOptions);
        return formattedDate;
    },

    _appendBadge: function (aTarget, aText, aClass = "") {
        let badgeElement = document.createElement("span");
        badgeElement.className = `badge ${aClass}`;
        badgeElement.innerText = aText;
        aTarget.appendChild(badgeElement);
        return badgeElement;
    },

    _appendInstallButton: function (aTarget, aAddonName, aInstallData) {
        let button = document.createElement("a");
        let buttonIcon = document.createElement("img");
        button.append(buttonIcon);
        button.className = "button";
        buttonIcon.className = "button-icon";
        buttonIcon.src = "assets/images/download.png";

        let isBrowserGRE = navigator.userAgent.includes("Goanna") && InstallTrigger;
        if (isBrowserGRE) {
            button.append("Install Now");
            button.href = "#";
            button.addEventListener("click", function (aEvent) {
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
        } else {
            button.append("Download");
            button.href = aInstallData.URL;
            button.classList.add("download");
        }

        aTarget.append(button);
        return button;
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
                container.innerHTML = aText;
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
                gSite._appendInstallButton(
                    listItem.parentElement,
                    addon.name,
                    {
                        URL: addon.xpiUrl,
                        IconURL: addon.iconUrl,
                        Hash: addon.hash
                    }
                );
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
            let response = await gAPI.request(METADATA_JSON);
            aMetadata = response.json;
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

    generateAddon: async function (aIsVersionHistory) {
        var pageDetails = {
            icon: document.getElementById("addon-icon"),
            name: document.getElementById("addon-name"),
            author: document.getElementById("addon-author"),
            description: document.getElementById("addon-desc"),
            download: document.getElementById("addon-download"),
            releaseCount: document.getElementById("addon-release-count"),
            releaseList: document.getElementById("list-releases"),
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

        var resourceLinks = {
            xpi: document.getElementById("download-xpi"),
            tarball: document.getElementById("download-tarball"),
            zipball: document.getElementById("download-zipball"),
            addonDetails: document.getElementById("link-addon-details"),
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
        if (addon.ghInfo) {
            resourceLinks.sourceRepository.href = gAPI.getRepositoryUrl(addon.ghInfo);
        }
        if (addon.repositoryUrl) {
            resourceLinks.sourceRepository.href = addon.repositoryUrl;
        }

        var releaseData = await gAPI.getReleases(addon.ghInfo);

        if (releaseData.message) {
            pageDetails.container.innerText = releaseData.message;
            gSite.doneLoading();
            return;
        }

        if (aIsVersionHistory) {
            resourceLinks.addonDetails.href = `/addons/get?addon=${addon.slug}`;
            pageDetails.releaseCount.innerText = releaseData.data.length;
            for (let i = 0; i < releaseData.data.length; i++) {
                let release = releaseData.data[i];
                let listItem = gSite._createListItem();
                listItem.icon.remove();
                listItem.title.innerText = release.name;
                if (release.prerelease) {
                    gSite._appendBadge(listItem.title, "Pre-release", "prerelease");
                }
                if (release.xpiUrl) {
                    gSite._appendInstallButton(
                        listItem.parentElement,
                        addon.name,
                        {
                            URL: release.xpiUrl,
                            IconURL: addon.iconUrl,
                        }
                    );
                }
                if (release.datePublished) {
                    let dateString = gSite._formatDate(release.datePublished);
                    listItem.appendDesc(`Released: ${dateString}`);
                }
                if (release.xpiSize) {
                    listItem.appendDesc(`Size: ${Math.round(release.xpiSize / 1024)} KB`);
                }
                if (release.xpiDownloadCount) {
                    listItem.appendDesc(`Downloads: ${release.xpiDownloadCount}`);
                }
                if (release.changelog) {
                    listItem.appendDesc(marked.parse(release.changelog));
                }
                pageDetails.releaseList.appendChild(listItem.parentElement);
            }
        } else {
            let release = releaseData.data[0];
            resourceLinks.versionHistory.href = `/addons/versions?addon=${addon.slug}`;
            pageDetails.author.innerText = `By ${release.author.name}`;
            pageDetails.version.innerText = release.name;
            pageDetails.description.innerText = addon.description;
            if (release.datePublished) {
                pageDetails.updateDate.innerText = gSite._formatDate(release.datePublished);
            }
            if (release.changelog) {
                pageDetails.about.innerHTML = marked.parse(release.changelog);
            }
            if (release.tarballUrl) {
                resourceLinks.tarball.href = release.tarballUrl;
            }
            if (release.zipballUrl) {
                resourceLinks.zipball.href = release.zipballUrl;
            }
            if (release.xpiUrl) {
                resourceLinks.xpi.href = release.xpiUrl;
                gSite._appendInstallButton(
                    pageDetails.download,
                    addon.name,
                    {
                        URL: release.xpiUrl,
                        IconURL: addon.iconUrl,
                    }
                );
            }
            if (release.xpiSize) {
                pageDetails.size.innerText = `${Math.round(release.xpiSize / 1024)} KB`;
            }
        }

        var resourceElements = Object.values(resourceLinks);
        for (let i = 0; i < resourceElements.length; i++) {
            let target = resourceElements[i];
            if (target && target.href == "") {
                target.hidden = true;
            }
        }
    },

    findAddon: async function (aSlug) {
        let response = await gAPI.request(METADATA_JSON);
        let metadata = response.json
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
