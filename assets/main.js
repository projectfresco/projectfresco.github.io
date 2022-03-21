var gSite = {
    generateList: function (aTarget, aAddonCategory) {
        var items = aAddonCategory.items;
        for (let i = 0; i < items.length; i++) {
            let addon = items[i];

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
                listItemIcon.src = aAddonCategory.defaultIcon;
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

            // Append list item to extensions list
            aTarget.appendChild(listItem);
        }
    },

    getAddons: async function () {
        var response = await fetch("assets/addons.json");
        var responseJson = await response.json();
        return responseJson;
    },

    onLoad: async function () {
        var listContainer = document.getElementById("lists");

        var json = await gSite.getAddons();
        var addons = json.addons;
        for (let i = 0; i < addons.length; i++) {
            let addonCategory = addons[i];

            let list = document.createElement("div");
            list.id = `list-${addonCategory.id}`;

            let listTitle = document.createElement("h1");
            listTitle.innerText = addonCategory.name;
            listTitle.id = addonCategory.id;
            list.append(listTitle);

            gSite.generateList(list, addonCategory);

            listContainer.append(list);
        }

        document.body.setAttribute("data-loaded", true);

        let fragmentId = window.location.hash.substr(1);
        if (fragmentId) {
            let targetElement = document.getElementById(fragmentId);
            targetElement.scrollIntoView(true);
        }
    },
};

window.addEventListener("load", gSite.onLoad);
