import { MobileToggle } from "@/components/mobile-toggle";
import { SavedView } from "@/components/inbox/saved-view";

export const metadata = { title: "Saved · Sociopals" };

const SavedPage = () => <SavedView mobileNav={<MobileToggle />} />;

export default SavedPage;
