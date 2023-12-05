import {mergeSameHousehold, readAllHouseholds, canonicalizeHouseholdNames, writeAllHouseholds} from "./households.js";

async function driver() {
    const allRows = await readAllHouseholds('local/household-accounts.csv')
    const goodRows = await canonicalizeHouseholdNames(allRows)
    const households = await mergeSameHousehold(goodRows)
    await writeAllHouseholds(households, 'local/household-contact-import.csv')
}

driver()
    .then(() => console.log("Import processed, output ready."))
