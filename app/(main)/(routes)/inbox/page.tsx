import { MobileToggle } from "@/components/mobile-toggle";
import { InboxView } from "@/components/inbox/inbox-view";

export const metadata = { title: "Inbox · Sociopals" };

const InboxPage = () => <InboxView mobileNav={<MobileToggle />} />;

export default InboxPage;
