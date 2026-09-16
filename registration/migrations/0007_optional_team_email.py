from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registration", "0006_expand_team_category"),
    ]

    operations = [
        migrations.AlterField(
            model_name="teamregistration",
            name="gmail",
            field=models.CharField(
                blank=True,
                default="",
                max_length=254,
                verbose_name="Team email",
            ),
        ),
    ]
