package de.unterwegs.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Weckt zur Erinnerung auf bzw. plant nach Neustart und App-Update alle Erinnerungen neu. */
public class ReminderReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Reminders.rescheduleAll(context);
            return;
        }
        String id = intent.getStringExtra(Reminders.EXTRA_ID);
        if (id != null) Reminders.show(context, id, intent.getIntExtra(Reminders.EXTRA_PHASE, 1));
    }
}
